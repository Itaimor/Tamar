"""Bounded metadata features for Tamar's hybrid LightFM preference model.

LightFM keeps user and item feature namespaces separate, so the strings below
are deliberately namespaced.  Each row also has a bounded total feature weight
so recipes with long ingredient lists and users with long histories do not
dominate the identity embeddings.
"""

from __future__ import annotations

from collections import defaultdict
import math
import os
import re
from typing import Iterable, Mapping

import pandas as pd


MAX_ITEM_INGREDIENT_FEATURES = int(
    os.getenv("RECOMMENDER_LIGHTFM_MAX_ITEM_INGREDIENT_FEATURES", "24")
)
MAX_USER_TASTE_FEATURES = int(
    os.getenv("RECOMMENDER_LIGHTFM_MAX_USER_TASTE_FEATURES", "24")
)

NUTRITION_FEATURES: tuple[tuple[str, tuple[float, ...]], ...] = (
    ("calories", (150.0, 300.0, 500.0, 800.0)),
    ("fat", (5.0, 15.0, 30.0, 50.0)),
    ("sugar", (5.0, 15.0, 30.0, 60.0)),
    # Food.com stores every nutrition value except calories as % daily value,
    # so sodium must use %DV buckets rather than milligram-like thresholds.
    ("sodium", (5.0, 15.0, 30.0, 60.0)),
    ("protein", (5.0, 15.0, 30.0, 50.0)),
    ("saturated_fat", (3.0, 8.0, 15.0, 30.0)),
    ("carbs", (15.0, 30.0, 60.0, 100.0)),
)


def normalize_feature_text(value: object) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9\s-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def finite_float(value: object) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def bucket_name(value: object, thresholds: tuple[float, ...]) -> str:
    number = finite_float(value)
    if number is None:
        return "unknown"
    for threshold in thresholds:
        if number <= threshold:
            return f"le_{threshold:g}"
    return f"gt_{thresholds[-1]:g}"


def _normalized_ingredients(recipe: Mapping[str, object]) -> list[str]:
    raw = recipe.get("ingredients") or []
    if not isinstance(raw, (list, tuple)):
        raw = [raw]

    unique: list[str] = []
    seen: set[str] = set()
    for value in raw:
        normalized = normalize_feature_text(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            unique.append(normalized)
        if len(unique) >= MAX_ITEM_INGREDIENT_FEATURES:
            break
    return unique


def recipe_feature_weights(recipe: Mapping[str, object]) -> dict[str, float]:
    """Return a bounded sparse feature row made from persisted recipe data."""
    features: dict[str, float] = {}
    ingredients = _normalized_ingredients(recipe)
    if ingredients:
        ingredient_weight = 1.0 / len(ingredients)
        for ingredient in ingredients:
            features[f"item:ingredient:{ingredient}"] = ingredient_weight
    else:
        features["item:ingredient:unknown"] = 0.25

    features[
        f"item:minutes:{bucket_name(recipe.get('minutes'), (15.0, 30.0, 60.0, 120.0))}"
    ] = 0.30
    features[
        f"item:steps:{bucket_name(recipe.get('n_steps'), (5.0, 10.0, 20.0, 35.0))}"
    ] = 0.20
    features[
        "item:ingredient_count:"
        f"{bucket_name(recipe.get('n_ingredients'), (5.0, 10.0, 15.0, 25.0))}"
    ] = 0.20

    nutrition = recipe.get("nutrition") or []
    if not isinstance(nutrition, (list, tuple)):
        nutrition = []
    for index, (name, thresholds) in enumerate(NUTRITION_FEATURES):
        value = nutrition[index] if index < len(nutrition) else None
        features[f"item:nutrition:{name}:{bucket_name(value, thresholds)}"] = 0.12

    ibs_friendly = recipe.get("is_ibs_friendly")
    if ibs_friendly is not None:
        features[f"item:ibs_friendly:{bool(ibs_friendly)}"] = 0.15

    return features


def build_item_feature_rows(
    recipes: Iterable[Mapping[str, object]],
    recipe_catalog: Iterable[str],
) -> dict[str, dict[str, float]]:
    recipes_by_id = {
        str(recipe.get("id")): recipe
        for recipe in recipes
        if recipe.get("id") is not None
    }
    return {
        str(recipe_id): recipe_feature_weights(recipes_by_id.get(str(recipe_id), {}))
        for recipe_id in recipe_catalog
    }


def _risk_bucket(value: object) -> str:
    number = finite_float(value)
    if number is None:
        return "unknown"
    if number < 0.25:
        return "low"
    if number < 0.55:
        return "medium"
    return "high"


def _add_normalized_group(
    destination: dict[str, float],
    raw_weights: Mapping[str, float],
    total_weight: float,
    limit: int | None = None,
) -> None:
    positive = [
        (name, float(weight))
        for name, weight in raw_weights.items()
        if finite_float(weight) is not None and float(weight) > 0
    ]
    positive.sort(key=lambda item: (-item[1], item[0]))
    if limit is not None:
        positive = positive[:limit]
    denominator = sum(weight for _name, weight in positive)
    if denominator <= 0:
        return
    for name, weight in positive:
        destination[name] = total_weight * weight / denominator


def build_user_feature_rows(
    user_ids: Iterable[str],
    active_user_ids: Iterable[str],
    ratings: pd.DataFrame,
    item_feature_rows: Mapping[str, Mapping[str, float]],
    restrictions: Iterable[Mapping[str, object]] = (),
    ingredient_risks: Iterable[Mapping[str, object]] = (),
    ibs_ingredient_risks: Iterable[Mapping[str, object]] = (),
) -> dict[str, dict[str, float]]:
    """Build shared, bounded user metadata and taste-profile feature rows."""
    normalized_users = [str(user_id) for user_id in user_ids]
    known_users = set(normalized_users)
    active_users = {str(user_id) for user_id in active_user_ids}
    result: dict[str, dict[str, float]] = {
        user_id: {
            "user:cohort:app" if user_id in active_users else "user:cohort:historical": 0.20
        }
        for user_id in normalized_users
    }

    taste_scores: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    if not ratings.empty:
        active_ratings = ratings[
            ratings["user_id"].astype(str).isin(active_users)
        ]
        for row in active_ratings.itertuples(index=False):
            user_id = str(getattr(row, "user_id"))
            recipe_id = str(getattr(row, "recipe_id"))
            rating = finite_float(getattr(row, "rating"))
            # The historical Food.com corpus can contain hundreds of thousands
            # of users. Their identity/cohort features still train CF, but
            # materializing a metadata taste profile for each would multiply
            # memory by the per-recipe feature count. Rich profiles are needed
            # only for the active app users served online.
            if (
                user_id not in known_users
                or rating is None
                or rating <= 0
            ):
                continue
            for feature_name, feature_weight in item_feature_rows.get(recipe_id, {}).items():
                if feature_name == "item:ingredient:unknown":
                    continue
                taste_scores[user_id][f"user:taste:{feature_name.removeprefix('item:')}"] += (
                    rating * feature_weight
                )

    for user_id, scores in taste_scores.items():
        _add_normalized_group(
            result[user_id],
            scores,
            total_weight=1.0,
            limit=MAX_USER_TASTE_FEATURES,
        )

    restrictions_by_user: dict[str, dict[str, float]] = defaultdict(dict)
    for row in restrictions:
        user_id = str(row.get("user_id") or "")
        if user_id not in known_users:
            continue
        restriction_type = normalize_feature_text(row.get("restriction_type")) or "unknown"
        ingredient = normalize_feature_text(
            row.get("normalized_name") or row.get("ingredient_name")
        )
        restrictions_by_user[user_id][f"user:restriction_type:{restriction_type}"] = 1.0
        if ingredient:
            restrictions_by_user[user_id][f"user:restricted_ingredient:{ingredient}"] = 1.0
    for user_id, values in restrictions_by_user.items():
        _add_normalized_group(result[user_id], values, total_weight=0.50, limit=12)

    risks_by_user: dict[str, dict[str, float]] = defaultdict(dict)
    for row in ingredient_risks:
        user_id = str(row.get("user_id") or "")
        if user_id not in known_users:
            continue
        ingredient = normalize_feature_text(
            row.get("normalized_name") or row.get("ingredient_name")
        )
        if not ingredient:
            continue
        confidence = finite_float(row.get("confidence"))
        risks_by_user[user_id][
            f"user:risk_ingredient:{ingredient}:{_risk_bucket(row.get('risk_score'))}"
        ] = max(0.05, confidence or 0.0)

    for row in ibs_ingredient_risks:
        user_id = str(row.get("user_id") or "")
        if user_id not in known_users:
            continue
        trigger_group = normalize_feature_text(row.get("trigger_group"))
        if not trigger_group:
            continue
        confidence = finite_float(row.get("confidence"))
        risks_by_user[user_id][
            f"user:ibs_group:{trigger_group}:{_risk_bucket(row.get('grade'))}"
        ] = max(0.05, confidence or 0.0)

    for user_id, values in risks_by_user.items():
        _add_normalized_group(result[user_id], values, total_weight=0.50, limit=12)

    return result
