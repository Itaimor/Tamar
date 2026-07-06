from __future__ import annotations

import pickle
import sys
from datetime import timedelta
from pathlib import Path

import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

sys.path.append(str(Path(__file__).resolve().parent))

from recommender_common import load_supabase_client
from risk_scoring import (
    FEATURE_COLUMNS,
    IngredientRiskResult,
    IngredientRiskSignal,
    SYMPTOM_MODEL_PATH,
    build_feature_row,
    clamp01,
    compute_recipe_ingredient_risk,
    fetch_rows,
    normalize_ingredient_name,
    parse_timestamp,
)


def build_personal_signal_index(rows: list[dict]) -> dict[str, list[IngredientRiskSignal]]:
    by_user: dict[str, list[IngredientRiskSignal]] = {}
    for row in rows:
        user_id = str(row.get("user_id"))
        normalized = normalize_ingredient_name(row.get("normalized_name") or row.get("ingredient_name"))
        if not user_id or not normalized:
            continue
        by_user.setdefault(user_id, []).append(
            IngredientRiskSignal(
                ingredient_name=str(row.get("ingredient_name") or normalized),
                normalized_name=normalized,
                risk_score=clamp01(float(row.get("risk_score") or row.get("grade") or 0)),
                confidence=clamp01(float(row.get("confidence") or 0)),
                source=str(row.get("evidence_source") or "training"),
            )
        )
    return by_user


def label_for_meal(meal: dict, reports_by_user: dict[str, list[dict]]) -> int | None:
    logged_at = parse_timestamp(meal.get("logged_at"))
    if logged_at is None:
        return None

    user_reports = reports_by_user.get(str(meal.get("user_id")), [])
    window_end = logged_at + timedelta(hours=48)
    reports = []
    for report in user_reports:
        reported_at = parse_timestamp(report.get("reported_at"))
        if reported_at is not None and logged_at <= reported_at <= window_end:
            reports.append(report)

    if not reports:
        return None

    max_severity = max(float(report.get("severity") or 0) for report in reports)
    any_no_symptoms = any(bool(report.get("no_symptoms")) for report in reports)
    if max_severity > 0.20:
        return 1
    if any_no_symptoms or max_severity <= 0.20:
        return 0
    return None


def train_model() -> None:
    supabase = load_supabase_client()

    meal_logs = fetch_rows(supabase, "meal_logs", "id, user_id, recipe_id, food_name, logged_at, calories, protein_g, fat_g")
    health_reports = fetch_rows(supabase, "health_reports", "user_id, reported_at, severity, no_symptoms")
    recipes = fetch_rows(supabase, "recipes", "id, ingredients, nutrition, minutes")

    try:
        generic_risks = fetch_rows(
            supabase,
            "user_ingredient_risks",
            "user_id, ingredient_name, normalized_name, risk_score, confidence, evidence_source",
        )
    except Exception:
        generic_risks = []

    try:
        ibs_risks = fetch_rows(
            supabase,
            "user_ibs_ingredient_risks",
            "user_id, ingredient_name, grade, confidence",
        )
    except Exception:
        ibs_risks = []

    recipes_by_id = {str(recipe["id"]): recipe for recipe in recipes}
    reports_by_user: dict[str, list[dict]] = {}
    for report in health_reports:
        reports_by_user.setdefault(str(report.get("user_id")), []).append(report)

    personal_by_user = build_personal_signal_index(generic_risks + ibs_risks)

    feature_rows: list[dict] = []
    labels: list[int] = []
    for meal in meal_logs:
        label = label_for_meal(meal, reports_by_user)
        if label is None:
            continue

        recipe = recipes_by_id.get(str(meal.get("recipe_id")))
        meal_nutrition = [
            float(meal.get("calories") or 0),
            float(meal.get("fat_g") or 0),
            0.0,
            0.0,
            float(meal.get("protein_g") or 0),
            0.0,
            0.0,
        ]
        if recipe is None:
            recipe = {
                "ingredients": [meal.get("food_name")],
                "nutrition": meal_nutrition if any(meal_nutrition) else [],
            }
        elif any(meal_nutrition):
            recipe = {**recipe, "nutrition": meal_nutrition}
        user_id = str(meal.get("user_id"))
        ingredient_risk: IngredientRiskResult = compute_recipe_ingredient_risk(
            recipe,
            personal_by_user.get(user_id, []),
            [],
        )
        feature_rows.append(
            build_feature_row(
                recipe=recipe,
                ingredient_risk=ingredient_risk,
                recent_context={"recent_symptom_severity": 0.0, "recent_meal_count": 0.0},
                now=parse_timestamp(meal.get("logged_at")),
            )
        )
        labels.append(label)

    if len(set(labels)) < 2 or len(labels) < 20:
        print(
            "[Warning] Not enough labeled meal/health-report pairs to train symptom model "
            f"(rows={len(labels)}, classes={sorted(set(labels))})."
        )
        return

    data = pd.DataFrame(feature_rows)[FEATURE_COLUMNS].fillna(0.0)
    target = pd.Series(labels)

    x_train, x_test, y_train, y_test = train_test_split(
        data,
        target,
        test_size=0.25,
        random_state=42,
        stratify=target,
    )

    model_name = "sklearn_gradient_boosting"
    try:
        from xgboost import XGBClassifier

        model = XGBClassifier(
            n_estimators=120,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="logloss",
            random_state=42,
        )
        model_name = "xgboost_symptom_risk"
    except Exception as exc:
        print(f"[Warning] xgboost unavailable, using sklearn GradientBoostingClassifier: {exc}")
        model = GradientBoostingClassifier(random_state=42)

    model.fit(x_train, y_train)

    auc_text = "n/a"
    if len(set(y_test)) == 2 and hasattr(model, "predict_proba"):
        predictions = model.predict_proba(x_test)[:, 1]
        auc_text = f"{roc_auc_score(y_test, predictions):.4f}"

    SYMPTOM_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SYMPTOM_MODEL_PATH.open("wb") as file:
        pickle.dump(
            {
                "model": model,
                "model_name": model_name,
                "feature_columns": FEATURE_COLUMNS,
                "train_rows": len(data),
                "test_auc": auc_text,
            },
            file,
        )

    print(
        f"Saved {model_name} symptom model to {SYMPTOM_MODEL_PATH} "
        f"(rows={len(data)}, test_auc={auc_text})."
    )


if __name__ == "__main__":
    train_model()
