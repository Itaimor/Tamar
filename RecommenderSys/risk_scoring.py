from __future__ import annotations

import math
import os
import pickle
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

try:
    from supabase import Client
except ImportError:  # pragma: no cover - handled by entrypoint modules.
    Client = Any


SYMPTOM_MODEL_PATH = Path(__file__).resolve().parent / "artifacts" / "xgboost_symptom_model.pkl"

STRICT_RESTRICTION_TYPES = {
    "allergy",
    "strict_sensitivity",
    "forbidden_ingredient",
    "diet_violation",
}

IBS_TRIGGER_GROUP_PRIORS = {
    "fructans_gos": 0.55,
    "lactose": 0.50,
    "excess_fructose": 0.45,
    "polyols": 0.45,
    "gas_producing": 0.35,
    "fatty_spicy_processed": 0.35,
    "caffeine_alcohol_fizzy": 0.30,
    "fiber_sensitive": 0.25,
}

KEYWORD_PRIORS = {
    "garlic": 0.65,
    "onion": 0.65,
    "shallot": 0.60,
    "leek": 0.55,
    "wheat": 0.52,
    "bread": 0.45,
    "pasta": 0.45,
    "milk": 0.52,
    "cream": 0.50,
    "yogurt": 0.45,
    "cheese": 0.40,
    "apple": 0.42,
    "pear": 0.42,
    "mango": 0.40,
    "honey": 0.38,
    "mushroom": 0.42,
    "cauliflower": 0.38,
    "beans": 0.45,
    "lentils": 0.45,
    "chickpeas": 0.42,
    "broccoli": 0.32,
    "cabbage": 0.32,
    "fried": 0.28,
    "spicy": 0.30,
    "coffee": 0.25,
    "alcohol": 0.30,
}

FEATURE_COLUMNS = [
    "contains_garlic",
    "contains_onion",
    "contains_wheat",
    "contains_lactose",
    "contains_fructans",
    "contains_polyols",
    "calories",
    "fat",
    "sugar",
    "sodium",
    "protein",
    "sat_fat",
    "carbs",
    "personal_risk_mean",
    "personal_risk_max",
    "personal_confidence_mean",
    "recent_symptom_severity",
    "recent_meal_count",
    "time_of_day_sin",
    "time_of_day_cos",
]


@dataclass
class IngredientRiskSignal:
    ingredient_name: str
    normalized_name: str
    risk_score: float
    confidence: float
    source: str


@dataclass
class IngredientRiskResult:
    score: float
    confidence: float
    matched_ingredients: list[str]
    max_personal_risk: float
    mean_personal_risk: float
    mean_personal_confidence: float


@dataclass
class RerankedCandidate:
    recipe_id: str
    preference_score: float
    ingredient_risk_score: float
    symptom_risk_score: float
    combined_risk_score: float
    final_score: float
    matched_ingredients: list[str]


def clamp01(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    return max(0.0, min(1.0, value))


def risk_lambda() -> float:
    return float(os.getenv("RECOMMENDER_RISK_LAMBDA", "1.0"))


def ingredient_risk_weight() -> float:
    return float(os.getenv("RECOMMENDER_INGREDIENT_RISK_WEIGHT", "0.4"))


def symptom_risk_weight() -> float:
    return float(os.getenv("RECOMMENDER_SYMPTOM_RISK_WEIGHT", "0.6"))


def normalize_ingredient_name(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def names_match(needle: str, haystack: str) -> bool:
    needle = normalize_ingredient_name(needle)
    haystack = normalize_ingredient_name(haystack)
    if not needle or not haystack:
        return False
    if needle == haystack:
        return True
    return f" {needle} " in f" {haystack} " or f" {haystack} " in f" {needle} "


def recipe_ingredient_texts(recipe: Optional[dict]) -> list[str]:
    if not recipe:
        return []
    ingredients = recipe.get("ingredients") or []
    if isinstance(ingredients, list):
        return [str(item).strip() for item in ingredients if str(item).strip()]
    return [str(ingredients).strip()] if str(ingredients).strip() else []


def numeric_nutrition(recipe: Optional[dict]) -> list[float]:
    values = (recipe or {}).get("nutrition") or []
    if not isinstance(values, list):
        return [0.0] * 7
    parsed: list[float] = []
    for value in values[:7]:
        try:
            parsed.append(float(value))
        except (TypeError, ValueError):
            parsed.append(0.0)
    while len(parsed) < 7:
        parsed.append(0.0)
    return parsed


def fetch_rows(
    supabase: Client,
    table_name: str,
    columns: str,
    page_size: int | None = None,
    query_builder: Any | None = None,
) -> list[dict]:
    page_size = page_size or int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000"))
    rows: list[dict] = []
    start = 0
    while True:
        query = query_builder if query_builder is not None else supabase.table(table_name).select(columns)
        response = query.range(start, start + page_size - 1).execute()
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def fetch_user_restrictions(supabase: Client, user_id: str) -> list[dict]:
    try:
        response = (
            supabase.table("user_restrictions")
            .select("ingredient_name, normalized_name, restriction_type, severity, is_strict")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data or []
    except Exception as exc:
        print(f"[Warning] Failed to fetch user restrictions: {exc}")
        return []


def fetch_user_ingredient_risks(supabase: Client, user_id: str) -> list[IngredientRiskSignal]:
    signals: dict[str, IngredientRiskSignal] = {}

    try:
        response = (
            supabase.table("user_ingredient_risks")
            .select("ingredient_name, normalized_name, risk_score, confidence")
            .eq("user_id", user_id)
            .execute()
        )
        for row in response.data or []:
            normalized = normalize_ingredient_name(row.get("normalized_name") or row.get("ingredient_name"))
            signal = IngredientRiskSignal(
                ingredient_name=str(row.get("ingredient_name") or normalized),
                normalized_name=normalized,
                risk_score=clamp01(float(row.get("risk_score") or 0)),
                confidence=clamp01(float(row.get("confidence") or 0)),
                source="personal",
            )
            signals[normalized] = signal
    except Exception as exc:
        print(f"[Warning] Failed to fetch generic ingredient risks: {exc}")

    try:
        response = (
            supabase.table("user_ibs_ingredient_risks")
            .select("ingredient_name, grade, confidence")
            .eq("user_id", user_id)
            .execute()
        )
        for row in response.data or []:
            normalized = normalize_ingredient_name(row.get("ingredient_name"))
            signal = IngredientRiskSignal(
                ingredient_name=str(row.get("ingredient_name") or normalized),
                normalized_name=normalized,
                risk_score=clamp01(float(row.get("grade") or 0)),
                confidence=clamp01(float(row.get("confidence") or 0)),
                source="ibs_profile",
            )
            existing = signals.get(normalized)
            if existing is None or signal.confidence >= existing.confidence:
                signals[normalized] = signal
    except Exception as exc:
        print(f"[Warning] Failed to fetch IBS profile ingredient risks: {exc}")

    return list(signals.values())


def fetch_population_priors(supabase: Client) -> list[IngredientRiskSignal]:
    signals: dict[str, IngredientRiskSignal] = {}

    try:
        response = (
            supabase.table("ibs_population_ingredient_priors")
            .select("ingredient_name, normalized_name, population_risk_score, confidence")
            .execute()
        )
        for row in response.data or []:
            normalized = normalize_ingredient_name(row.get("normalized_name") or row.get("ingredient_name"))
            signals[normalized] = IngredientRiskSignal(
                ingredient_name=str(row.get("ingredient_name") or normalized),
                normalized_name=normalized,
                risk_score=clamp01(float(row.get("population_risk_score") or 0)),
                confidence=clamp01(float(row.get("confidence") or 0.35)),
                source="population_prior",
            )
    except Exception as exc:
        print(f"[Warning] Failed to fetch IBS population priors: {exc}")

    try:
        response = supabase.table("ibs_ingredients").select("ingredient_name, trigger_group").execute()
        for row in response.data or []:
            normalized = normalize_ingredient_name(row.get("ingredient_name"))
            if normalized in signals:
                continue
            trigger_group = str(row.get("trigger_group") or "")
            signals[normalized] = IngredientRiskSignal(
                ingredient_name=str(row.get("ingredient_name") or normalized),
                normalized_name=normalized,
                risk_score=IBS_TRIGGER_GROUP_PRIORS.get(trigger_group, 0.25),
                confidence=0.25,
                source="ibs_catalog_prior",
            )
    except Exception:
        pass

    return list(signals.values())


def heuristic_population_prior(normalized_ingredient: str) -> float:
    for keyword, score in KEYWORD_PRIORS.items():
        if names_match(keyword, normalized_ingredient):
            return score
    return 0.08


def best_matching_signal(
    ingredient_text: str,
    signals: list[IngredientRiskSignal],
) -> Optional[IngredientRiskSignal]:
    normalized = normalize_ingredient_name(ingredient_text)
    matches = [signal for signal in signals if names_match(signal.normalized_name, normalized)]
    if not matches:
        return None
    return max(matches, key=lambda item: (item.confidence, item.risk_score))


def compute_recipe_ingredient_risk(
    recipe: Optional[dict],
    personal_signals: list[IngredientRiskSignal],
    population_signals: list[IngredientRiskSignal],
) -> IngredientRiskResult:
    ingredients = recipe_ingredient_texts(recipe)
    if not ingredients:
        return IngredientRiskResult(
            score=0.12,
            confidence=0.0,
            matched_ingredients=[],
            max_personal_risk=0.0,
            mean_personal_risk=0.0,
            mean_personal_confidence=0.0,
        )

    final_scores: list[float] = []
    confidences: list[float] = []
    personal_scores: list[float] = []
    personal_confidences: list[float] = []
    matched: list[str] = []

    for ingredient in ingredients:
        normalized = normalize_ingredient_name(ingredient)
        personal = best_matching_signal(normalized, personal_signals)
        population = best_matching_signal(normalized, population_signals)
        population_score = (
            population.risk_score
            if population is not None
            else heuristic_population_prior(normalized)
        )
        population_confidence = population.confidence if population is not None else 0.15

        if personal is not None:
            confidence = clamp01(max(0.25, personal.confidence))
            risk_score = confidence * personal.risk_score + (1 - confidence) * population_score
            personal_scores.append(personal.risk_score)
            personal_confidences.append(personal.confidence)
            matched.append(personal.ingredient_name)
            confidences.append(confidence)
        else:
            risk_score = population_score
            confidences.append(population_confidence)
            if population is not None:
                matched.append(population.ingredient_name)

        final_scores.append(clamp01(risk_score))

    return IngredientRiskResult(
        score=clamp01(float(np.mean(final_scores))),
        confidence=clamp01(float(np.mean(confidences))) if confidences else 0.0,
        matched_ingredients=sorted(set(matched)),
        max_personal_risk=max(personal_scores) if personal_scores else 0.0,
        mean_personal_risk=float(np.mean(personal_scores)) if personal_scores else 0.0,
        mean_personal_confidence=float(np.mean(personal_confidences)) if personal_confidences else 0.0,
    )


def is_hard_filtered(recipe: Optional[dict], restrictions: list[dict]) -> bool:
    if not restrictions:
        return False

    recipe_names = [normalize_ingredient_name(item) for item in recipe_ingredient_texts(recipe)]
    if not recipe_names:
        return False

    for restriction in restrictions:
        restriction_type = str(restriction.get("restriction_type") or "")
        is_strict = bool(restriction.get("is_strict", True))
        if not is_strict and restriction_type not in STRICT_RESTRICTION_TYPES:
            continue
        restricted_name = normalize_ingredient_name(
            restriction.get("normalized_name") or restriction.get("ingredient_name")
        )
        if any(names_match(restricted_name, ingredient) for ingredient in recipe_names):
            return True
    return False


def parse_timestamp(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def fetch_recent_user_context(supabase: Client, user_id: str) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    context = {"recent_symptom_severity": 0.0, "recent_meal_count": 0.0}

    try:
        response = (
            supabase.table("health_reports")
            .select("severity")
            .eq("user_id", user_id)
            .gte("reported_at", since)
            .execute()
        )
        severities = [float(row.get("severity") or 0) for row in response.data or []]
        if severities:
            context["recent_symptom_severity"] = clamp01(max(severities))
    except Exception as exc:
        print(f"[Warning] Failed to fetch recent health context: {exc}")

    try:
        response = (
            supabase.table("meal_logs")
            .select("id")
            .eq("user_id", user_id)
            .gte("logged_at", since)
            .execute()
        )
        context["recent_meal_count"] = float(len(response.data or []))
    except Exception as exc:
        print(f"[Warning] Failed to fetch recent meal context: {exc}")

    return context


def build_feature_row(
    recipe: Optional[dict],
    ingredient_risk: IngredientRiskResult,
    recent_context: dict,
    now: Optional[datetime] = None,
) -> dict[str, float]:
    text = " ".join(recipe_ingredient_texts(recipe)).lower()
    calories, fat, sugar, sodium, protein, sat_fat, carbs = numeric_nutrition(recipe)
    now = now or datetime.now(timezone.utc)
    hour = now.hour + now.minute / 60

    return {
        "contains_garlic": float("garlic" in text),
        "contains_onion": float("onion" in text or "shallot" in text or "leek" in text),
        "contains_wheat": float(any(token in text for token in ["wheat", "flour", "bread", "pasta"])),
        "contains_lactose": float(any(token in text for token in ["milk", "cream", "yogurt", "cheese", "butter"])),
        "contains_fructans": float(
            any(token in text for token in ["garlic", "onion", "wheat", "bread", "pasta", "beans", "lentils"])
        ),
        "contains_polyols": float(any(token in text for token in ["mushroom", "cauliflower", "avocado", "sorbitol"])),
        "calories": calories,
        "fat": fat,
        "sugar": sugar,
        "sodium": sodium,
        "protein": protein,
        "sat_fat": sat_fat,
        "carbs": carbs,
        "personal_risk_mean": ingredient_risk.mean_personal_risk,
        "personal_risk_max": ingredient_risk.max_personal_risk,
        "personal_confidence_mean": ingredient_risk.mean_personal_confidence,
        "recent_symptom_severity": float(recent_context.get("recent_symptom_severity") or 0),
        "recent_meal_count": float(recent_context.get("recent_meal_count") or 0),
        "time_of_day_sin": math.sin(2 * math.pi * hour / 24),
        "time_of_day_cos": math.cos(2 * math.pi * hour / 24),
    }


def load_symptom_model(path: Path = SYMPTOM_MODEL_PATH) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        with path.open("rb") as file:
            artifact = pickle.load(file)
        if not isinstance(artifact, dict) or "model" not in artifact:
            return None
        return artifact
    except Exception as exc:
        print(f"[Warning] Failed to load symptom model artifact: {exc}")
        return None


def heuristic_symptom_risk(feature_row: dict[str, float], ingredient_risk: float) -> float:
    fat_load = clamp01(feature_row.get("fat", 0) / 40)
    calorie_load = clamp01(feature_row.get("calories", 0) / 700)
    trigger_flags = (
        feature_row.get("contains_garlic", 0)
        + feature_row.get("contains_onion", 0)
        + feature_row.get("contains_wheat", 0)
        + feature_row.get("contains_lactose", 0)
        + feature_row.get("contains_polyols", 0)
    )
    trigger_load = clamp01(trigger_flags / 3)
    recent = clamp01(feature_row.get("recent_symptom_severity", 0))
    return clamp01(0.08 + 0.55 * ingredient_risk + 0.12 * fat_load + 0.08 * calorie_load + 0.10 * trigger_load + 0.07 * recent)


def predict_symptom_risks(
    feature_rows: list[dict[str, float]],
    ingredient_risks: list[float],
    model_artifact: Optional[dict] = None,
) -> list[float]:
    if not feature_rows:
        return []

    artifact = model_artifact if model_artifact is not None else load_symptom_model()
    if artifact is not None:
        try:
            columns = artifact.get("feature_columns") or FEATURE_COLUMNS
            model = artifact["model"]
            matrix = pd.DataFrame(feature_rows)[columns].fillna(0.0)
            if hasattr(model, "predict_proba"):
                predictions = model.predict_proba(matrix)[:, 1]
            else:
                predictions = model.predict(matrix)
            return [clamp01(float(value)) for value in predictions]
        except Exception as exc:
            print(f"[Warning] Symptom model prediction failed, using heuristic risk: {exc}")

    return [
        heuristic_symptom_risk(row, ingredient_risk)
        for row, ingredient_risk in zip(feature_rows, ingredient_risks)
    ]


def rerank_candidates(
    candidates: list[tuple[str, float]],
    recipes_meta: dict[str, dict],
    restrictions: list[dict],
    personal_signals: list[IngredientRiskSignal],
    population_signals: list[IngredientRiskSignal],
    recent_context: dict,
) -> list[RerankedCandidate]:
    prelim: list[tuple[str, float, IngredientRiskResult, dict[str, float]]] = []

    for recipe_id, preference_score in candidates:
        recipe = recipes_meta.get(str(recipe_id))
        if is_hard_filtered(recipe, restrictions):
            continue

        ingredient_risk = compute_recipe_ingredient_risk(recipe, personal_signals, population_signals)
        feature_row = build_feature_row(recipe, ingredient_risk, recent_context)
        prelim.append((str(recipe_id), float(preference_score), ingredient_risk, feature_row))

    symptom_scores = predict_symptom_risks(
        [row[3] for row in prelim],
        [row[2].score for row in prelim],
    )

    ingredient_weight = ingredient_risk_weight()
    symptom_weight = symptom_risk_weight()
    total_weight = ingredient_weight + symptom_weight
    if total_weight <= 0:
        ingredient_weight, symptom_weight, total_weight = 0.4, 0.6, 1.0

    reranked: list[RerankedCandidate] = []
    for (recipe_id, preference_score, ingredient_risk, _feature_row), symptom_score in zip(prelim, symptom_scores):
        combined_risk = clamp01(
            (ingredient_weight * ingredient_risk.score + symptom_weight * symptom_score) / total_weight
        )
        final_score = preference_score - risk_lambda() * combined_risk
        reranked.append(
            RerankedCandidate(
                recipe_id=recipe_id,
                preference_score=preference_score,
                ingredient_risk_score=ingredient_risk.score,
                symptom_risk_score=symptom_score,
                combined_risk_score=combined_risk,
                final_score=final_score,
                matched_ingredients=ingredient_risk.matched_ingredients,
            )
        )

    reranked.sort(key=lambda item: item.final_score, reverse=True)
    return reranked


def prediction_feature_payload(candidate: RerankedCandidate) -> dict[str, Any]:
    return {
        "preference_score": candidate.preference_score,
        "ingredient_risk_score": candidate.ingredient_risk_score,
        "symptom_risk_score": candidate.symptom_risk_score,
        "combined_risk_score": candidate.combined_risk_score,
        "matched_ingredients": candidate.matched_ingredients,
    }
