from __future__ import annotations

import os
import pickle
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

sys.path.append(str(Path(__file__).resolve().parent))

from recommender_common import get_artifact_bucket, load_supabase_client
from risk_scoring import (
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    IngredientRiskResult,
    RECENT_CONTEXT_WINDOW_HOURS,
    SYMPTOM_MODEL_PATH,
    SYMPTOM_POSITIVE_THRESHOLD,
    build_feature_row,
    build_recipe_trigger_profile,
    clamp01,
    fetch_rows,
    parse_timestamp,
    summarize_recent_context,
)


def explicit_report_outcome(report: dict) -> tuple[int, datetime] | None:
    reported_at = parse_timestamp(report.get("reported_at"))
    if reported_at is None:
        return None
    if bool(report.get("no_symptoms")):
        return 0, reported_at
    symptom_type = str(report.get("symptom_type") or "").strip().lower()
    severity = clamp01(float(report.get("severity") or 0))
    if (
        symptom_type not in {"none", "no symptoms", "no_symptoms"}
        and severity > SYMPTOM_POSITIVE_THRESHOLD
    ):
        return 1, reported_at
    return None


def label_for_meal(meal: dict, reports_by_user: dict[str, list[dict]]) -> int | None:
    logged_at = parse_timestamp(meal.get("logged_at"))
    if logged_at is None:
        return None

    user_reports = reports_by_user.get(str(meal.get("user_id")), [])
    window_end = logged_at + timedelta(hours=48)
    qualifying_reports: list[tuple[datetime, int]] = []
    for report in user_reports:
        outcome = explicit_report_outcome(report)
        if outcome is None:
            continue
        label, reported_at = outcome
        if logged_at <= reported_at <= window_end:
            qualifying_reports.append((reported_at, label))

    if not qualifying_reports:
        return None
    # The nearest explicit outcome is the least ambiguous target when several
    # reports exist in a meal's attribution window.
    qualifying_reports.sort(key=lambda item: item[0])
    return qualifying_reports[0][1]


def match_meals_to_outcomes(
    meals: list[dict],
    reports: list[dict],
) -> list[tuple[dict, int, datetime]]:
    """Assign each explicit report to at most one nearest preceding meal.

    This prevents a single check-in from becoming duplicate labels for every
    meal in its 48-hour lookback window. Each meal also receives at most one
    outcome.
    """
    eligible_meals = [
        (index, logged_at, meal)
        for index, meal in enumerate(meals)
        for logged_at in [parse_timestamp(meal.get("logged_at"))]
        if logged_at is not None
    ]
    unmatched_meal_indices = {index for index, _logged_at, _meal in eligible_meals}
    matches: list[tuple[dict, int, datetime]] = []

    explicit_outcomes = sorted(
        (
            outcome_at,
            label,
        )
        for report in reports
        for outcome in [explicit_report_outcome(report)]
        if outcome is not None
        for label, outcome_at in [outcome]
    )
    for outcome_at, label in explicit_outcomes:
        candidates = [
            (index, logged_at, meal)
            for index, logged_at, meal in eligible_meals
            if (
                logged_at <= outcome_at <= logged_at + timedelta(hours=48)
            )
        ]
        if not candidates:
            continue
        meal_index, _logged_at, meal = max(candidates, key=lambda item: item[1])
        # Several follow-up reports about the same most-recent meal must not
        # cascade backward and incorrectly label older meals.
        if meal_index not in unmatched_meal_indices:
            continue
        unmatched_meal_indices.remove(meal_index)
        matches.append((meal, label, outcome_at))

    matches.sort(key=lambda item: parse_timestamp(item[0].get("logged_at")) or item[2])
    return matches


def build_causal_context_for_meal(
    meal: dict,
    meals_by_user: dict[str, list[dict]],
    reports_by_user: dict[str, list[dict]],
) -> dict[str, float]:
    logged_at = parse_timestamp(meal.get("logged_at"))
    if logged_at is None:
        return summarize_recent_context(datetime.now(timezone.utc), [], [])
    user_id = str(meal.get("user_id"))
    return summarize_recent_context(
        reference_time=logged_at,
        meal_rows=meals_by_user.get(user_id, []),
        health_rows=reports_by_user.get(user_id, []),
    )


def split_training_examples(
    data: pd.DataFrame,
    target: pd.Series,
    user_groups: pd.Series,
    meal_timestamps: pd.Series,
    outcome_timestamps: pd.Series | None = None,
    minimum_train_class_rows: int = 2,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, str]:
    indices = pd.Series(range(len(data)))
    unique_groups = user_groups.nunique()
    if outcome_timestamps is None:
        outcome_timestamps = meal_timestamps

    def training_classes_are_supported(values: pd.Series) -> bool:
        counts = values.value_counts()
        return (
            len(counts) == 2
            and int(counts.min()) >= max(1, int(minimum_train_class_rows))
        )

    if unique_groups >= 2:
        splitter = GroupShuffleSplit(n_splits=24, test_size=0.25, random_state=42)
        for train_idx, test_idx in splitter.split(indices, target, groups=user_groups):
            y_train = target.iloc[train_idx]
            y_test = target.iloc[test_idx]
            if training_classes_are_supported(y_train) and y_test.nunique() == 2:
                return (
                    data.iloc[train_idx],
                    data.iloc[test_idx],
                    y_train,
                    y_test,
                    "group_disjoint",
                )

    # A chronological holdout is purged by outcome availability: every
    # retained training label must have been reported before the first test
    # meal occurred.
    chronological_indices = sorted(
        range(len(data)),
        key=lambda index: meal_timestamps.iloc[index],
    )
    split_at = max(1, min(len(data) - 1, int(len(data) * 0.75)))
    test_idx = chronological_indices[split_at:]
    first_test_meal_at = min(meal_timestamps.iloc[index] for index in test_idx)
    train_idx = [
        index
        for index in chronological_indices[:split_at]
        if outcome_timestamps.iloc[index] < first_test_meal_at
    ]
    if train_idx and training_classes_are_supported(target.iloc[train_idx]):
        return (
            data.iloc[train_idx],
            data.iloc[test_idx],
            target.iloc[train_idx],
            target.iloc[test_idx],
            "chronological_purged",
        )

    # A random same-user row split would overstate quality. Train on all
    # eligible rows but publish no holdout metric when neither safe split is
    # possible.
    return (
        data,
        data.iloc[0:0],
        target,
        target.iloc[0:0],
        "no_valid_holdout",
    )


def upload_symptom_artifact(supabase, artifact_path: Path = SYMPTOM_MODEL_PATH) -> None:
    storage_path = os.getenv(
        "SUPABASE_SYMPTOM_MODEL_ARTIFACT",
        "xgboost_symptom_model.pkl",
    ).strip()
    if not storage_path or not artifact_path.exists():
        print(f"[Warning] Symptom artifact upload skipped: {artifact_path}")
        return
    bucket = get_artifact_bucket()
    try:
        with artifact_path.open("rb") as file:
            supabase.storage.from_(bucket).upload(
                storage_path,
                file,
                file_options={
                    "content-type": "application/octet-stream",
                    "upsert": "true",
                },
            )
        print(f"Uploaded symptom model artifact to Supabase Storage: {bucket}/{storage_path}")
    except Exception as exc:
        print(f"[Warning] Failed to upload symptom model artifact: {exc}")


def train_model() -> None:
    supabase = load_supabase_client()

    meal_logs = fetch_rows(
        supabase,
        "meal_logs",
        "id, user_id, recipe_id, food_name, logged_at",
    )
    health_reports = fetch_rows(
        supabase,
        "health_reports",
        "user_id, reported_at, symptom_type, severity, no_symptoms",
    )
    recipes = fetch_rows(
        supabase,
        "recipes",
        "id, ingredients, nutrition, minutes, n_ingredients, n_steps",
    )

    recipes_by_id = {str(recipe["id"]): recipe for recipe in recipes}
    for meal in meal_logs:
        recent_recipe = recipes_by_id.get(str(meal.get("recipe_id")))
        if recent_recipe is None:
            recent_recipe = {"ingredients": [meal.get("food_name")]}
        meal["_trigger_load"] = build_recipe_trigger_profile(
            recent_recipe
        )["trigger_ingredient_fraction"]

    reports_by_user: dict[str, list[dict]] = {}
    for report in health_reports:
        reports_by_user.setdefault(str(report.get("user_id")), []).append(report)
    meals_by_user: dict[str, list[dict]] = {}
    for meal in meal_logs:
        meals_by_user.setdefault(str(meal.get("user_id")), []).append(meal)

    feature_rows: list[dict] = []
    labels: list[int] = []
    user_groups: list[str] = []
    example_meal_timestamps: list[datetime] = []
    example_outcome_timestamps: list[datetime] = []
    skipped_without_catalog_recipe = 0
    matched_meal_outcomes = [
        match
        for user_id, user_meals in meals_by_user.items()
        for match in match_meals_to_outcomes(
            user_meals,
            reports_by_user.get(user_id, []),
        )
    ]
    for meal, label, outcome_at in matched_meal_outcomes:

        recipe = recipes_by_id.get(str(meal.get("recipe_id")))
        if recipe is None:
            skipped_without_catalog_recipe += 1
            continue
        logged_at = parse_timestamp(meal.get("logged_at"))
        if logged_at is None:
            continue

        user_id = str(meal.get("user_id"))
        ingredient_risk = IngredientRiskResult(
            score=0.0,
            confidence=0.0,
            matched_ingredients=[],
            max_personal_risk=0.0,
            mean_personal_risk=0.0,
            mean_personal_confidence=0.0,
            personal_match_count=0,
            ingredient_count=len(recipe.get("ingredients") or []),
            personal_coverage=0.0,
        )
        feature_rows.append(
            build_feature_row(
                recipe=recipe,
                ingredient_risk=ingredient_risk,
                recent_context=build_causal_context_for_meal(
                    meal,
                    meals_by_user,
                    reports_by_user,
                ),
                now=logged_at,
                meal_context=meal,
            )
        )
        labels.append(label)
        user_groups.append(user_id)
        example_meal_timestamps.append(logged_at)
        example_outcome_timestamps.append(outcome_at)

    minimum_training_rows = max(
        20,
        int(os.getenv("RECOMMENDER_SYMPTOM_MIN_TRAINING_ROWS", "100")),
    )
    minimum_class_rows = max(
        2,
        int(os.getenv("RECOMMENDER_SYMPTOM_MIN_CLASS_ROWS", "20")),
    )
    minimum_users = max(
        2,
        int(os.getenv("RECOMMENDER_SYMPTOM_MIN_USERS", "5")),
    )
    class_counts = Counter(int(value) for value in labels)
    if (
        len(class_counts) < 2
        or min(class_counts.values(), default=0) < minimum_class_rows
        or len(labels) < minimum_training_rows
        or len(set(user_groups)) < minimum_users
    ):
        print(
            "[Warning] Not enough labeled meal/health-report pairs to train symptom model "
            f"(rows={len(labels)}, required={minimum_training_rows}, "
            f"class_counts={dict(sorted(class_counts.items()))}, "
            f"required_per_class={minimum_class_rows}, users={len(set(user_groups))}, "
            f"required_users={minimum_users})."
        )
        return

    data = pd.DataFrame(feature_rows)[FEATURE_COLUMNS].fillna(0.0)
    target = pd.Series(labels)
    x_train, x_test, y_train, y_test, split_strategy = split_training_examples(
        data,
        target,
        pd.Series(user_groups),
        pd.Series(example_meal_timestamps),
        pd.Series(example_outcome_timestamps),
        minimum_train_class_rows=max(2, minimum_class_rows // 2),
    )

    model_name = "sklearn_gradient_boosting"
    try:
        from xgboost import XGBClassifier

        training_class_counts = Counter(int(value) for value in y_train)
        scale_pos_weight = training_class_counts.get(0, 1) / max(
            1, training_class_counts.get(1, 1)
        )
        model = XGBClassifier(
            n_estimators=120,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            scale_pos_weight=scale_pos_weight,
            eval_metric="logloss",
            random_state=42,
        )
        model_name = "xgboost_symptom_risk"
    except Exception as exc:
        print(f"[Warning] xgboost unavailable, using sklearn GradientBoostingClassifier: {exc}")
        model = GradientBoostingClassifier(random_state=42)

    model.fit(x_train, y_train)

    auc_text = "n/a"
    log_loss_text = "n/a"
    brier_text = "n/a"
    if len(y_test) and hasattr(model, "predict_proba"):
        predictions = model.predict_proba(x_test)[:, 1]
        log_loss_text = f"{log_loss(y_test, predictions, labels=[0, 1]):.4f}"
        brier_text = f"{brier_score_loss(y_test, predictions):.4f}"
    if len(set(y_test)) == 2 and hasattr(model, "predict_proba"):
        auc_text = f"{roc_auc_score(y_test, predictions):.4f}"

    # Metrics above are honest holdout estimates. Refit the production model
    # on all eligible outcomes so the uploaded artifact does not discard the
    # holdout (especially the newest chronological rows).
    if len(y_test):
        if model_name == "xgboost_symptom_risk":
            full_class_counts = Counter(int(value) for value in target)
            model.set_params(
                scale_pos_weight=full_class_counts.get(0, 1)
                / max(1, full_class_counts.get(1, 1))
            )
        model.fit(data, target)

    class_counts = Counter(int(value) for value in target)
    SYMPTOM_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SYMPTOM_MODEL_PATH.open("wb") as file:
        pickle.dump(
            {
                "model": model,
                "model_name": model_name,
                "feature_columns": FEATURE_COLUMNS,
                "feature_schema_version": FEATURE_SCHEMA_VERSION,
                "nutrition_units": {
                    "recipe_calories": "kcal",
                    "recipe_fat_pdv": "percent_daily_value",
                    "recipe_sugar_pdv": "percent_daily_value",
                    "recipe_sodium_pdv": "percent_daily_value",
                    "recipe_protein_pdv": "percent_daily_value",
                    "recipe_sat_fat_pdv": "percent_daily_value",
                    "recipe_carbs_pdv": "percent_daily_value",
                },
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "train_rows": len(data),
                "fit_rows": len(data),
                "evaluation_train_rows": len(x_train),
                "test_rows": len(x_test),
                "class_counts": {str(label): count for label, count in sorted(class_counts.items())},
                "split_strategy": split_strategy,
                "label_window_hours": RECENT_CONTEXT_WINDOW_HOURS,
                "positive_severity_threshold": SYMPTOM_POSITIVE_THRESHOLD,
                "minimum_training_rows": minimum_training_rows,
                "minimum_class_rows": minimum_class_rows,
                "minimum_users": minimum_users,
                "independent_outcome_count": len(data),
                "matched_report_count": len(matched_meal_outcomes),
                "catalog_rows_skipped": skipped_without_catalog_recipe,
                "test_auc": auc_text,
                "test_log_loss": log_loss_text,
                "test_brier_score": brier_text,
                "probability_calibrated": False,
            },
            file,
        )

    upload_symptom_artifact(supabase, SYMPTOM_MODEL_PATH)
    print(
        f"Saved {model_name} symptom model to {SYMPTOM_MODEL_PATH} "
        f"(rows={len(data)}, split={split_strategy}, test_auc={auc_text}, "
        f"test_log_loss={log_loss_text}, test_brier={brier_text})."
    )


if __name__ == "__main__":
    train_model()
