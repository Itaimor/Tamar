from __future__ import annotations

import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

try:
    from supabase import Client
except ImportError:  # pragma: no cover - handled by entrypoint modules.
    Client = Any

from risk_scoring import (
    IBS_TRIGGER_GROUP_PRIORS,
    clamp01,
    fetch_rows,
    normalize_ingredient_name,
    parse_timestamp,
    recipe_ingredient_texts,
)


ATTRIBUTION_WINDOW_HOURS = 48
ATTRIBUTION_DECAY_HOURS = 18
RISK_PRIOR_POSITIVE = 0.75
RISK_PRIOR_TOTAL = 3.0


def chunked(items: list[dict], size: int = 500) -> list[list[dict]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_or_now(value: Any) -> datetime:
    return parse_timestamp(value) or datetime.now(timezone.utc)


def fetch_recipe(supabase: Client, recipe_id: str | int) -> Optional[dict]:
    try:
        response = (
            supabase.table("recipes")
            .select("id, ingredients, nutrition, minutes")
            .eq("id", int(recipe_id))
            .limit(1)
            .execute()
        )
        return (response.data or [None])[0]
    except Exception as exc:
        print(f"[Warning] Failed to fetch recipe {recipe_id}: {exc}")
        return None


def fetch_recipe_ingredient_names(supabase: Client, recipe_id: str | int) -> list[str]:
    try:
        response = (
            supabase.table("recipe_ingredients")
            .select("ingredient_name")
            .eq("recipe_id", int(recipe_id))
            .execute()
        )
        names = [row["ingredient_name"] for row in response.data or [] if row.get("ingredient_name")]
        if names:
            return names
    except Exception:
        pass

    recipe = fetch_recipe(supabase, recipe_id)
    return recipe_ingredient_texts(recipe)


def ingredient_rows_from_names(names: list[str], source: str = "meal_log") -> list[dict]:
    rows: dict[str, dict] = {}
    for name in names:
        normalized = normalize_ingredient_name(name)
        if not normalized:
            continue
        rows[normalized] = {
            "ingredient_name": str(name).strip(),
            "normalized_name": normalized,
            "source": source,
            "updated_at": utc_now_iso(),
        }
    return list(rows.values())


def upsert_ingredient_names(supabase: Client, names: list[str], source: str = "meal_log") -> None:
    rows = ingredient_rows_from_names(names, source=source)
    if not rows:
        return
    for chunk in chunked(rows):
        try:
            supabase.table("ingredients").upsert(chunk, on_conflict="normalized_name").execute()
        except Exception as exc:
            print(f"[Warning] Failed to upsert ingredient catalog rows: {exc}")
            return


def log_meal(
    supabase: Client,
    user_id: str,
    food_name: str,
    recipe_id: str | int | None = None,
    logged_at: Any = None,
    portion_size: float | None = None,
    portion_unit: str | None = None,
    image_url: str | None = None,
    notes: str | None = None,
) -> dict:
    logged_dt = parse_or_now(logged_at)
    meal_payload = {
        "user_id": user_id,
        "recipe_id": int(recipe_id) if recipe_id is not None else None,
        "food_name": food_name,
        "logged_at": logged_dt.isoformat(),
        "portion_size": portion_size,
        "portion_unit": portion_unit,
        "image_url": image_url,
        "notes": notes,
    }

    response = supabase.table("meal_logs").insert(meal_payload).execute()
    meal_row = (response.data or [None])[0]
    if not meal_row:
        raise RuntimeError("Meal log insert did not return a row.")

    ingredient_names = (
        fetch_recipe_ingredient_names(supabase, recipe_id)
        if recipe_id is not None
        else [food_name]
    )
    upsert_ingredient_names(supabase, ingredient_names, source="meal_log")

    exposure_rows = []
    for ingredient_name in ingredient_names:
        normalized = normalize_ingredient_name(ingredient_name)
        if not normalized:
            continue
        exposure_rows.append(
            {
                "user_id": user_id,
                "meal_log_id": meal_row["id"],
                "recipe_id": int(recipe_id) if recipe_id is not None else None,
                "ingredient_name": ingredient_name,
                "normalized_name": normalized,
                "exposed_at": logged_dt.isoformat(),
                "portion_weight": float(portion_size) if portion_size else 1.0,
            }
        )

    for chunk in chunked(exposure_rows):
        supabase.table("user_ingredient_exposures").insert(chunk).execute()

    return {
        "meal_log": meal_row,
        "exposure_count": len(exposure_rows),
        "ingredients": ingredient_names,
    }


def attribution_weight(exposed_at: datetime, reported_at: datetime) -> float:
    hours = max(0.0, (reported_at - exposed_at).total_seconds() / 3600)
    if hours > ATTRIBUTION_WINDOW_HOURS:
        return 0.0
    return float(math.exp(-hours / ATTRIBUTION_DECAY_HOURS))


def status_for_risk(risk_score: float, confidence: float) -> str:
    if confidence >= 0.65 and risk_score >= 0.75:
        return "known_bad"
    if risk_score >= 0.55:
        return "suspected_bad"
    if confidence >= 0.65 and risk_score <= 0.20:
        return "known_good"
    if confidence >= 0.35 and risk_score <= 0.35:
        return "suspected_good"
    return "unknown"


def fetch_existing_risks(supabase: Client, user_id: str, normalized_names: list[str]) -> dict[str, dict]:
    if not normalized_names:
        return {}
    try:
        response = (
            supabase.table("user_ingredient_risks")
            .select(
                "ingredient_name, normalized_name, exposure_count, positive_evidence, "
                "negative_evidence, risk_score, confidence"
            )
            .eq("user_id", user_id)
            .in_("normalized_name", normalized_names)
            .execute()
        )
        return {row["normalized_name"]: row for row in response.data or []}
    except Exception as exc:
        print(f"[Warning] Failed to fetch existing ingredient risks: {exc}")
        return {}


def update_personal_risks_from_exposures(
    supabase: Client,
    user_id: str,
    exposures: list[dict],
    severity: float,
    reported_at: datetime,
    no_symptoms: bool,
) -> list[dict]:
    evidence_by_ingredient: dict[str, dict] = {}
    for exposure in exposures:
        exposed_at = parse_timestamp(exposure.get("exposed_at"))
        if exposed_at is None:
            continue
        weight = attribution_weight(exposed_at, reported_at) * float(exposure.get("portion_weight") or 1)
        if weight <= 0:
            continue

        normalized = normalize_ingredient_name(exposure.get("normalized_name") or exposure.get("ingredient_name"))
        if not normalized:
            continue
        evidence = evidence_by_ingredient.setdefault(
            normalized,
            {
                "ingredient_name": exposure.get("ingredient_name") or normalized,
                "normalized_name": normalized,
                "positive": 0.0,
                "negative": 0.0,
                "exposures": 0,
            },
        )
        evidence["exposures"] += 1
        if no_symptoms or severity <= 0.20:
            evidence["negative"] += weight * max(0.1, 1 - severity)
        else:
            evidence["positive"] += weight * severity

    existing = fetch_existing_risks(supabase, user_id, list(evidence_by_ingredient.keys()))
    now = utc_now_iso()
    rows: list[dict] = []

    for normalized, evidence in evidence_by_ingredient.items():
        current = existing.get(normalized, {})
        exposure_count = int(current.get("exposure_count") or 0) + int(evidence["exposures"])
        positive = float(current.get("positive_evidence") or 0) + float(evidence["positive"])
        negative = float(current.get("negative_evidence") or 0) + float(evidence["negative"])
        risk_score = clamp01((positive + RISK_PRIOR_POSITIVE) / (positive + negative + RISK_PRIOR_TOTAL))
        confidence = clamp01((positive + negative) / 6)

        rows.append(
            {
                "user_id": user_id,
                "ingredient_name": evidence["ingredient_name"],
                "normalized_name": normalized,
                "exposure_count": exposure_count,
                "positive_evidence": round(positive, 4),
                "negative_evidence": round(negative, 4),
                "risk_score": round(risk_score, 4),
                "confidence": round(confidence, 4),
                "status": status_for_risk(risk_score, confidence),
                "last_evidence_at": reported_at.isoformat(),
                "updated_at": now,
            }
        )

    for chunk in chunked(rows):
        supabase.table("user_ingredient_risks").upsert(chunk, on_conflict="user_id,normalized_name").execute()

    return rows


def report_health(
    supabase: Client,
    user_id: str,
    symptom_type: str,
    severity: float,
    reported_at: Any = None,
    notes: str | None = None,
    no_symptoms: bool = False,
) -> dict:
    reported_dt = parse_or_now(reported_at)
    severity = clamp01(float(severity))
    report_payload = {
        "user_id": user_id,
        "reported_at": reported_dt.isoformat(),
        "symptom_type": symptom_type or ("none" if no_symptoms else "digestive_discomfort"),
        "severity": severity,
        "no_symptoms": bool(no_symptoms),
        "notes": notes,
    }

    response = supabase.table("health_reports").insert(report_payload).execute()
    report_row = (response.data or [None])[0]
    if not report_row:
        raise RuntimeError("Health report insert did not return a row.")

    since = (reported_dt - timedelta(hours=ATTRIBUTION_WINDOW_HOURS)).isoformat()
    response = (
        supabase.table("user_ingredient_exposures")
        .select("ingredient_name, normalized_name, exposed_at, portion_weight")
        .eq("user_id", user_id)
        .gte("exposed_at", since)
        .lte("exposed_at", reported_dt.isoformat())
        .execute()
    )
    exposures = response.data or []
    updated_rows = update_personal_risks_from_exposures(
        supabase=supabase,
        user_id=user_id,
        exposures=exposures,
        severity=severity,
        reported_at=reported_dt,
        no_symptoms=no_symptoms,
    )

    return {
        "health_report": report_row,
        "attributed_exposure_count": len(exposures),
        "updated_risk_count": len(updated_rows),
        "updated_risks": updated_rows,
    }


def sync_recipe_ingredients_from_recipes(supabase: Client, limit: int | None = None) -> dict:
    rows = fetch_rows(supabase, "recipes", "id, ingredients")
    if limit is not None:
        rows = rows[:limit]

    ingredient_names: list[str] = []
    recipe_ingredient_rows: list[dict] = []
    for recipe in rows:
        recipe_id = recipe.get("id")
        for ingredient_name in recipe_ingredient_texts(recipe):
            normalized = normalize_ingredient_name(ingredient_name)
            if not normalized:
                continue
            ingredient_names.append(ingredient_name)
            recipe_ingredient_rows.append(
                {
                    "recipe_id": int(recipe_id),
                    "ingredient_name": ingredient_name,
                    "normalized_name": normalized,
                    "confidence": 1.0,
                }
            )

    upsert_ingredient_names(supabase, ingredient_names, source="recipe_catalog")
    for chunk in chunked(recipe_ingredient_rows):
        supabase.table("recipe_ingredients").upsert(
            chunk,
            on_conflict="recipe_id,normalized_name",
        ).execute()

    return {
        "recipe_count": len(rows),
        "recipe_ingredient_count": len(recipe_ingredient_rows),
    }


def sync_ibs_population_priors(supabase: Client) -> dict:
    try:
        response = supabase.table("ibs_ingredients").select("ingredient_name, trigger_group, source_notes").execute()
    except Exception as exc:
        print(f"[Warning] Failed to fetch IBS ingredient catalog: {exc}")
        return {"prior_count": 0}

    rows = []
    for item in response.data or []:
        ingredient_name = item.get("ingredient_name")
        normalized = normalize_ingredient_name(ingredient_name)
        trigger_group = item.get("trigger_group")
        if not normalized or not trigger_group:
            continue
        rows.append(
            {
                "ingredient_name": ingredient_name,
                "normalized_name": normalized,
                "trigger_group": trigger_group,
                "population_risk_score": IBS_TRIGGER_GROUP_PRIORS.get(trigger_group, 0.25),
                "confidence": 0.35,
                "source_notes": item.get("source_notes") or "IBS ingredient catalog prior",
                "updated_at": utc_now_iso(),
            }
        )

    for chunk in chunked(rows):
        supabase.table("ibs_population_ingredient_priors").upsert(
            chunk,
            on_conflict="ingredient_name",
        ).execute()

    return {"prior_count": len(rows)}


def add_user_restriction(
    supabase: Client,
    user_id: str,
    ingredient_name: str,
    restriction_type: str,
    severity: str = "strict",
    is_strict: bool = True,
    notes: str | None = None,
) -> dict:
    normalized = normalize_ingredient_name(ingredient_name)
    upsert_ingredient_names(supabase, [ingredient_name], source="user_restriction")
    payload = {
        "user_id": user_id,
        "ingredient_name": ingredient_name,
        "normalized_name": normalized,
        "restriction_type": restriction_type,
        "severity": severity,
        "is_strict": is_strict,
        "notes": notes,
        "updated_at": utc_now_iso(),
    }
    response = supabase.table("user_restrictions").upsert(
        payload,
        on_conflict="user_id,normalized_name,restriction_type",
    ).execute()
    return (response.data or [payload])[0]


def main() -> None:
    from recommender_common import load_supabase_client

    command = os.getenv("RECOMMENDER_HEALTH_COMMAND", "sync-recipe-ingredients")
    supabase = load_supabase_client()

    if command == "sync-recipe-ingredients":
        print(sync_recipe_ingredients_from_recipes(supabase))
    elif command == "sync-ibs-priors":
        print(sync_ibs_population_priors(supabase))
    else:
        raise SystemExit(f"Unknown RECOMMENDER_HEALTH_COMMAND: {command}")


if __name__ == "__main__":
    main()
