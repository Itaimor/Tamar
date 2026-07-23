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

HARD_RESTRICTION_ALIASES: dict[str, tuple[str, ...]] = {
    "dairy": ("milk", "cream", "yogurt", "cheese", "butter", "whey", "casein"),
    "egg": ("egg", "albumen", "meringue"),
    "gluten": ("wheat", "barley", "rye", "spelt", "semolina", "bulgur", "seitan"),
    "peanut": ("peanut", "groundnut"),
    "soy": ("soy", "soya", "soybean", "tofu", "tempeh", "edamame"),
    "tree nut": (
        "almond",
        "brazil nut",
        "cashew",
        "hazelnut",
        "macadamia",
        "pecan",
        "pistachio",
        "walnut",
    ),
    "nut": (
        "peanut",
        "almond",
        "brazil nut",
        "cashew",
        "hazelnut",
        "macadamia",
        "pecan",
        "pistachio",
        "walnut",
    ),
    "shellfish": (
        "shrimp",
        "prawn",
        "crab",
        "lobster",
        "crayfish",
        "mussel",
        "clam",
        "oyster",
        "scallop",
    ),
}

NON_DAIRY_RESTRICTION_MARKERS = (
    "almond milk",
    "cashew milk",
    "coconut cream",
    "coconut milk",
    "cream of tartar",
    "hemp milk",
    "oat milk",
    "plant milk",
    "rice milk",
    "soy milk",
)

FEATURE_SCHEMA_VERSION = 2
RECENT_CONTEXT_WINDOW_HOURS = 48
SYMPTOM_POSITIVE_THRESHOLD = 0.20

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

# These names are retained in every feature row so already-trained artifacts
# can continue to select their stored feature_columns. New V2 models train on
# FEATURE_COLUMNS below, whose nutrition names make the Food.com units clear.
LEGACY_FEATURE_COLUMNS = [
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

TRIGGER_GROUPS = tuple(IBS_TRIGGER_GROUP_PRIORS)

# Ingredient aliases are deliberately ingredient-oriented rather than generic
# recipe-title substrings. A recipe ingredient may map to multiple profiles
# (for example, onion rings are both fructan/GOS and fatty/fried).
TRIGGER_GROUP_ALIASES: dict[str, tuple[str, ...]] = {
    "fructans_gos": (
        "garlic",
        "garlic powder",
        "onion",
        "onion powder",
        "shallot",
        "leek",
        "spring onion white",
        "scallion white",
        "wheat",
        "wheat flour",
        "plain flour",
        "all purpose flour",
        "bread",
        "pasta",
        "spaghetti",
        "macaroni",
        "penne",
        "fettuccine",
        "lasagna",
        "couscous",
        "wheat noodles",
        "ramen noodles",
        "rye",
        "barley",
        "spelt",
        "semolina",
        "bulgur",
        "farro",
        "inulin",
        "chicory root",
        "artichoke",
        "asparagus",
        "black beans",
        "kidney beans",
        "baked beans",
        "pinto beans",
        "navy beans",
        "cannellini beans",
        "lentils",
        "chickpeas",
        "garbanzo beans",
        "hummus",
        "split peas",
        "soybeans",
        "edamame",
        "cashews",
        "pistachios",
    ),
    "lactose": (
        "cow milk",
        "goat milk",
        "evaporated milk",
        "condensed milk",
        "heavy cream",
        "sour cream",
        "whipped cream",
        "ice cream",
        "yogurt",
        "greek yogurt",
        "soft cheese",
        "cream cheese",
        "ricotta",
        "cottage cheese",
        "custard",
        "kefir",
        "milk chocolate",
        "whey protein",
        "buttermilk",
    ),
    "excess_fructose": (
        "apple",
        "pear",
        "mango",
        "watermelon",
        "cherry",
        "honey",
        "agave",
        "high fructose corn syrup",
        "fruit juice",
        "apple juice",
        "orange juice",
        "dried fruit",
        "raisins",
        "dates",
        "figs",
        "prunes",
        "peach",
        "nectarine",
        "apricot",
        "plum",
        "persimmon",
        "lychee",
    ),
    "polyols": (
        "sorbitol",
        "mannitol",
        "xylitol",
        "maltitol",
        "erythritol",
        "isomalt",
        "sugar free gum",
        "sugar free candy",
        "mushroom",
        "cauliflower",
        "snow peas",
        "sugar snap peas",
        "avocado",
        "sweet corn",
    ),
    "gas_producing": (
        "broccoli",
        "cabbage",
        "brussels sprouts",
        "kale",
        "radish",
        "turnip",
        "sauerkraut",
        "coleslaw",
        "raw salad",
    ),
    "fatty_spicy_processed": (
        "fried food",
        "french fries",
        "onion rings",
        "fried chicken",
        "bacon",
        "sausage",
        "salami",
        "pepperoni",
        "processed meat",
        "hot dog",
        "chili pepper",
        "jalapeno",
        "hot sauce",
        "spicy food",
        "curry",
        "cream sauce",
        "gravy",
        "butter",
        "margarine",
        "mayonnaise",
        "fast food",
        "pizza",
        "burger",
        "chocolate",
        "cocoa",
    ),
    "caffeine_alcohol_fizzy": (
        "coffee",
        "espresso",
        "latte",
        "cappuccino",
        "black tea",
        "energy drink",
        "cola",
        "soda",
        "soft drink",
        "fizzy drink",
        "sparkling water",
        "beer",
        "wine",
        "liquor",
        "vodka",
        "whiskey",
        "rum",
        "tequila",
        "cocktail",
        "alcohol",
    ),
    "fiber_sensitive": (
        "bran",
        "oat bran",
        "high fiber cereal",
        "granola",
        "whole wheat bread",
        "wholegrain bread",
        "whole grain bread",
        "brown rice",
        "quinoa",
        "chia seeds",
        "flaxseed",
        "almonds",
        "walnuts",
        "peanuts",
        "popcorn",
    ),
}

NON_WHEAT_FLOUR_MARKERS = (
    "almond flour",
    "rice flour",
    "coconut flour",
    "corn flour",
    "oat flour",
    "chickpea flour",
    "gluten free flour",
    "buckwheat flour",
    "cassava flour",
    "tapioca flour",
)

NON_DAIRY_LACTOSE_MARKERS = (
    "almond milk",
    "soy milk",
    "oat milk",
    "coconut milk",
    "rice milk",
    "cashew milk",
    "plant milk",
    "lactose free",
    "dairy free",
    "non dairy",
    "coconut cream",
    "cream of tartar",
)

FEATURE_COLUMNS = [
    "catalog_recipe_present",
    "recipe_ingredients_missing",
    "recipe_ingredient_count_missing",
    "recipe_nutrition_missing",
    "recipe_minutes_missing",
    "recipe_step_count_missing",
    "recipe_calories",
    "recipe_fat_pdv",
    "recipe_sugar_pdv",
    "recipe_sodium_pdv",
    "recipe_protein_pdv",
    "recipe_sat_fat_pdv",
    "recipe_carbs_pdv",
    "recipe_minutes",
    "recipe_ingredient_count",
    "recipe_step_count",
    "trigger_group_count",
    "trigger_ingredient_count",
    "trigger_ingredient_fraction",
    *[
        feature_name
        for group in TRIGGER_GROUPS
        for feature_name in (f"trigger_{group}_present", f"trigger_{group}_count")
    ],
    "recent_symptom_max",
    "recent_symptom_mean",
    "recent_no_symptom_fraction",
    "recent_positive_report_count",
    "recent_meal_count",
    "recent_trigger_load",
    "hours_since_last_symptom",
    "hours_since_last_symptom_missing",
    "hours_since_last_meal",
    "hours_since_last_meal_missing",
]

# Retained in feature rows only so an already-trained artifact that explicitly
# stored these columns remains readable. New recommendation-time models do not
# train on current-meal values because those values are unknown while ranking a
# future meal.
LEGACY_LOGGED_MEAL_FEATURE_COLUMNS = [
    "logged_calories",
    "logged_calories_missing",
    "logged_protein_g",
    "logged_protein_g_missing",
    "logged_fat_g",
    "logged_fat_g_missing",
    "logged_portion_size",
    "logged_portion_size_missing",
    "logged_nutrition_confidence",
    "logged_nutrition_confidence_missing",
    "portion_unit_grams",
    "portion_unit_ounces",
    "portion_unit_servings",
    "portion_unit_volume",
    "portion_unit_other",
    "portion_unit_unknown",
]

SUPPORTED_SYMPTOM_MODEL_FEATURES = frozenset(
    FEATURE_COLUMNS
    + LEGACY_FEATURE_COLUMNS
    + LEGACY_LOGGED_MEAL_FEATURE_COLUMNS
)


@dataclass
class IngredientRiskSignal:
    ingredient_name: str
    normalized_name: str
    risk_score: float
    confidence: float
    source: str
    trigger_group: str | None = None
    available_at: datetime | None = None


@dataclass
class IngredientRiskResult:
    score: float
    confidence: float
    matched_ingredients: list[str]
    max_personal_risk: float
    mean_personal_risk: float
    mean_personal_confidence: float
    personal_match_count: int = 0
    ingredient_count: int = 0
    personal_coverage: float = 0.0


@dataclass
class RerankedCandidate:
    recipe_id: str
    preference_score: float
    ingredient_risk_score: float
    symptom_risk_score: float
    combined_risk_score: float
    final_score: float
    matched_ingredients: list[str]


class RestrictionDataUnavailableError(RuntimeError):
    """Raised when hard-filter state cannot be read safely."""


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


def _singularize_ingredient_token(token: str) -> str:
    if (
        len(token) <= 3
        or token.endswith(("ss", "us", "is"))
        or token in {"gas", "molasses"}
    ):
        return token
    irregular = {
        "leaves": "leaf",
        "loaves": "loaf",
        "potatoes": "potato",
        "tomatoes": "tomato",
    }
    if token in irregular:
        return irregular[token]
    if token.endswith("ies") and len(token) > 4:
        return f"{token[:-3]}y"
    if token.endswith(("ches", "shes", "xes", "zes")):
        return token[:-2]
    if token.endswith("s"):
        return token[:-1]
    return token


def normalize_ingredient_name(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ").replace("-", " ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [
        _singularize_ingredient_token(token)
        for token in re.sub(r"\s+", " ", text).strip().split()
    ]
    return " ".join(token for token in tokens if token)


def names_match(needle: str, haystack: str) -> bool:
    needle = normalize_ingredient_name(needle)
    haystack = normalize_ingredient_name(haystack)
    if not needle or not haystack:
        return False
    if needle == haystack:
        return True
    return f" {needle} " in f" {haystack} " or f" {haystack} " in f" {needle} "


def ingredient_contains_phrase(ingredient_text: str, phrase: str) -> bool:
    """Return whether a normalized ingredient contains a token-bounded phrase.

    Unlike ``names_match``, this is deliberately directional. A specific
    trigger such as ``brown rice`` may match ``cooked brown rice``, but it must
    not cause the broader ingredient ``rice`` to become a trigger.
    """
    ingredient = normalize_ingredient_name(ingredient_text)
    normalized_phrase = normalize_ingredient_name(phrase)
    if not ingredient or not normalized_phrase:
        return False
    return (
        ingredient == normalized_phrase
        or f" {normalized_phrase} " in f" {ingredient} "
    )


def remove_bounded_ingredient_phrases(
    ingredient_text: str,
    phrases: tuple[str, ...],
) -> str:
    """Mask known-safe phrases while leaving other ingredient terms visible."""
    padded = f" {normalize_ingredient_name(ingredient_text)} "
    for phrase in phrases:
        normalized_phrase = normalize_ingredient_name(phrase)
        if normalized_phrase:
            padded = padded.replace(f" {normalized_phrase} ", " ")
    return " ".join(padded.split())


def restriction_matches_ingredient(restricted_name: str, ingredient_text: str) -> bool:
    """Match a restriction directionally against one recipe ingredient.

    Direction matters: a broad ``peanut`` restriction must match ``peanut
    butter``, while a narrower ``peanut butter`` restriction must not exclude
    plain peanuts. Token boundaries avoid substring collisions such as
    ``pea``/``peanut``.
    """
    restricted = normalize_ingredient_name(restricted_name)
    ingredient = normalize_ingredient_name(ingredient_text)
    if not restricted or not ingredient:
        return False

    if restricted in {"dairy", "milk", "cream"}:
        ingredient = remove_bounded_ingredient_phrases(
            ingredient,
            NON_DAIRY_RESTRICTION_MARKERS,
        )
        if not ingredient:
            return False

    candidates = (restricted, *HARD_RESTRICTION_ALIASES.get(restricted, ()))
    return any(
        candidate == ingredient
        or f" {candidate} " in f" {ingredient} "
        for candidate in candidates
    )


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


def optional_finite_float(value: Any, minimum: float | None = None) -> float | None:
    if value is None or value == "":
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or (minimum is not None and numeric < minimum):
        return None
    return numeric


def recipe_nutrition_with_presence(recipe: Optional[dict]) -> tuple[list[float], bool]:
    values = (recipe or {}).get("nutrition")
    if not isinstance(values, list) or len(values) < 7:
        return numeric_nutrition(recipe), False
    parsed = [optional_finite_float(value, minimum=0.0) for value in values[:7]]
    return [value if value is not None else 0.0 for value in parsed], all(
        value is not None for value in parsed
    )


def ingredient_matches_trigger_group(ingredient_text: str, group: str) -> bool:
    normalized = normalize_ingredient_name(ingredient_text)
    if not normalized:
        return False

    if group == "fructans_gos" and any(
        ingredient_contains_phrase(normalized, marker)
        for marker in NON_WHEAT_FLOUR_MARKERS
    ):
        aliases = tuple(
            alias
            for alias in TRIGGER_GROUP_ALIASES[group]
            if alias not in {"plain flour", "all purpose flour", "wheat flour", "wheat"}
        )
    else:
        aliases = TRIGGER_GROUP_ALIASES.get(group, ())

    if group == "lactose":
        normalized = remove_bounded_ingredient_phrases(
            normalized,
            NON_DAIRY_LACTOSE_MARKERS,
        )
        if not normalized:
            return False

    if any(ingredient_contains_phrase(normalized, alias) for alias in aliases):
        return True

    # Food.com commonly uses bare "milk" and "cream"; treat them as dairy only
    # after the plant/non-dairy exclusions above.
    if group == "lactose":
        return ingredient_contains_phrase(
            normalized, "milk"
        ) or ingredient_contains_phrase(normalized, "cream")
    return False


def build_recipe_trigger_profile(recipe: Optional[dict]) -> dict[str, float]:
    ingredients = recipe_ingredient_texts(recipe)
    counts = {group: 0 for group in TRIGGER_GROUPS}
    triggered_ingredients: set[int] = set()

    for ingredient_index, ingredient in enumerate(ingredients):
        for group in TRIGGER_GROUPS:
            if ingredient_matches_trigger_group(ingredient, group):
                counts[group] += 1
                triggered_ingredients.add(ingredient_index)

    ingredient_count = len(ingredients)
    present_group_count = sum(count > 0 for count in counts.values())
    profile: dict[str, float] = {
        "trigger_group_count": float(present_group_count),
        "trigger_ingredient_count": float(len(triggered_ingredients)),
        "trigger_ingredient_fraction": (
            float(len(triggered_ingredients) / ingredient_count) if ingredient_count else 0.0
        ),
    }
    for group, count in counts.items():
        profile[f"trigger_{group}_present"] = float(count > 0)
        profile[f"trigger_{group}_count"] = float(count)
    return profile


def empty_recent_context() -> dict[str, float]:
    return {
        "recent_symptom_severity": 0.0,
        "recent_symptom_max": 0.0,
        "recent_symptom_mean": 0.0,
        "recent_no_symptom_fraction": 0.0,
        "recent_positive_report_count": 0.0,
        "recent_meal_count": 0.0,
        "recent_trigger_load": 0.0,
        "hours_since_last_symptom": float(RECENT_CONTEXT_WINDOW_HOURS),
        "hours_since_last_symptom_missing": 1.0,
        "hours_since_last_meal": float(RECENT_CONTEXT_WINDOW_HOURS),
        "hours_since_last_meal_missing": 1.0,
    }


def summarize_recent_context(
    reference_time: datetime,
    meal_rows: list[dict],
    health_rows: list[dict],
    window_hours: int = RECENT_CONTEXT_WINDOW_HOURS,
) -> dict[str, float]:
    reference_time = parse_timestamp(reference_time) or datetime.now(timezone.utc)
    window_start = reference_time - timedelta(hours=window_hours)
    context = empty_recent_context()

    prior_meals = sorted(
        (
            timestamp,
            clamp01(
                optional_finite_float(row.get("_trigger_load"), minimum=0.0)
                or 0.0
            ),
        )
        for row in meal_rows
        for timestamp in [parse_timestamp(row.get("logged_at"))]
        if timestamp is not None and window_start <= timestamp < reference_time
    )
    prior_meal_times = [timestamp for timestamp, _trigger_load in prior_meals]
    context["recent_meal_count"] = float(len(prior_meal_times))
    if prior_meal_times:
        context["hours_since_last_meal"] = max(
            0.0, (reference_time - prior_meal_times[-1]).total_seconds() / 3600
        )
        context["hours_since_last_meal_missing"] = 0.0
        context["recent_trigger_load"] = clamp01(
            float(np.mean([trigger_load for _timestamp, trigger_load in prior_meals]))
        )

    prior_reports: list[tuple[datetime, float, bool]] = []
    for row in health_rows:
        reported_at = parse_timestamp(row.get("reported_at"))
        if reported_at is None or not (window_start <= reported_at < reference_time):
            continue
        prior_reports.append(
            (
                reported_at,
                clamp01(optional_finite_float(row.get("severity"), minimum=0.0) or 0.0),
                bool(row.get("no_symptoms")),
            )
        )
    prior_reports.sort(key=lambda item: item[0])

    if prior_reports:
        severities = [severity for _, severity, _ in prior_reports]
        symptom_max = max(severities)
        context["recent_symptom_severity"] = symptom_max
        context["recent_symptom_max"] = symptom_max
        context["recent_symptom_mean"] = float(np.mean(severities))
        context["recent_no_symptom_fraction"] = float(
            np.mean([float(no_symptoms) for _, _, no_symptoms in prior_reports])
        )
        positive_reports = [
            item
            for item in prior_reports
            if not item[2] and item[1] > SYMPTOM_POSITIVE_THRESHOLD
        ]
        context["recent_positive_report_count"] = float(len(positive_reports))
        if positive_reports:
            context["hours_since_last_symptom"] = max(
                0.0, (reference_time - positive_reports[-1][0]).total_seconds() / 3600
            )
            context["hours_since_last_symptom_missing"] = 0.0

    return context


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
        raise RestrictionDataUnavailableError(
            "Hard-restriction data could not be loaded; recommendation refresh was aborted."
        ) from exc


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
        if ingredient_contains_phrase(normalized_ingredient, keyword):
            return score
    return 0.08


def best_matching_signal(
    ingredient_text: str,
    signals: list[IngredientRiskSignal],
) -> Optional[IngredientRiskSignal]:
    normalized = normalize_ingredient_name(ingredient_text)
    matches = [
        signal
        for signal in signals
        if restriction_matches_ingredient(signal.normalized_name, normalized)
    ]
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
            personal_match_count=0,
            ingredient_count=0,
            personal_coverage=0.0,
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
        personal_match_count=len(personal_scores),
        ingredient_count=len(ingredients),
        personal_coverage=clamp01(len(personal_scores) / len(ingredients)),
    )


def is_hard_filtered(recipe: Optional[dict], restrictions: list[dict]) -> bool:
    if not restrictions:
        return False

    strict_restrictions: list[dict] = []
    for restriction in restrictions:
        restriction_type = (
            str(restriction.get("restriction_type") or "")
            .strip()
            .lower()
            .replace("-", "_")
            .replace(" ", "_")
        )
        raw_is_strict = restriction.get("is_strict", True)
        if isinstance(raw_is_strict, str):
            is_strict = raw_is_strict.strip().lower() in {"1", "true", "yes", "strict"}
        else:
            is_strict = bool(raw_is_strict)
        if restriction_type in STRICT_RESTRICTION_TYPES or is_strict:
            strict_restrictions.append(restriction)

    if not strict_restrictions:
        return False

    recipe_names = recipe_ingredient_texts(recipe)
    if not recipe_names:
        # A strict restriction cannot be proven safe without ingredient data.
        return True

    for restriction in strict_restrictions:
        restricted_name = normalize_ingredient_name(
            restriction.get("normalized_name") or restriction.get("ingredient_name")
        )
        if not restricted_name:
            # Invalid restriction rows must not silently disable the safety layer.
            return True
        if any(
            restriction_matches_ingredient(restricted_name, ingredient)
            for ingredient in recipe_names
        ):
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
    reference_time = datetime.now(timezone.utc)
    since = (reference_time - timedelta(hours=RECENT_CONTEXT_WINDOW_HOURS)).isoformat()
    health_rows: list[dict] = []
    meal_rows: list[dict] = []

    try:
        response = (
            supabase.table("health_reports")
            .select("reported_at, severity, no_symptoms")
            .eq("user_id", user_id)
            .gte("reported_at", since)
            .execute()
        )
        health_rows = response.data or []
    except Exception as exc:
        print(f"[Warning] Failed to fetch recent health context: {exc}")

    try:
        response = (
            supabase.table("meal_logs")
            .select("id, food_name, logged_at")
            .eq("user_id", user_id)
            .gte("logged_at", since)
            .execute()
        )
        meal_rows = response.data or []
    except Exception as exc:
        print(f"[Warning] Failed to fetch recent meal context: {exc}")

    exposure_names_by_meal: dict[str, list[str]] = {}
    try:
        response = (
            supabase.table("user_ingredient_exposures")
            .select("meal_log_id, ingredient_name, exposed_at")
            .eq("user_id", user_id)
            .gte("exposed_at", since)
            .execute()
        )
        for row in response.data or []:
            meal_log_id = row.get("meal_log_id")
            ingredient_name = row.get("ingredient_name")
            if meal_log_id is None or not ingredient_name:
                continue
            exposure_names_by_meal.setdefault(str(meal_log_id), []).append(
                str(ingredient_name)
            )
    except Exception as exc:
        print(f"[Warning] Failed to fetch recent ingredient-load context: {exc}")

    for meal in meal_rows:
        ingredient_names = exposure_names_by_meal.get(str(meal.get("id")), [])
        if not ingredient_names and meal.get("food_name"):
            ingredient_names = [str(meal["food_name"])]
        meal["_trigger_load"] = build_recipe_trigger_profile(
            {"ingredients": ingredient_names}
        )["trigger_ingredient_fraction"]

    return summarize_recent_context(reference_time, meal_rows, health_rows)


def portion_unit_features(portion_unit: Any) -> dict[str, float]:
    unit = normalize_ingredient_name(portion_unit)
    features = {
        "portion_unit_grams": 0.0,
        "portion_unit_ounces": 0.0,
        "portion_unit_servings": 0.0,
        "portion_unit_volume": 0.0,
        "portion_unit_other": 0.0,
        "portion_unit_unknown": 0.0,
    }
    if not unit:
        features["portion_unit_unknown"] = 1.0
    elif unit in {"g", "gram", "grams", "kg", "kilogram", "kilograms"}:
        features["portion_unit_grams"] = 1.0
    elif unit in {"oz", "ounce", "ounces", "lb", "pound", "pounds"}:
        features["portion_unit_ounces"] = 1.0
    elif unit in {"serving", "servings", "portion", "portions", "piece", "pieces"}:
        features["portion_unit_servings"] = 1.0
    elif unit in {
        "ml",
        "milliliter",
        "milliliters",
        "l",
        "liter",
        "liters",
        "cup",
        "cups",
        "tbsp",
        "tablespoon",
        "tablespoons",
        "tsp",
        "teaspoon",
        "teaspoons",
    }:
        features["portion_unit_volume"] = 1.0
    else:
        features["portion_unit_other"] = 1.0
    return features


def build_feature_row(
    recipe: Optional[dict],
    ingredient_risk: IngredientRiskResult,
    recent_context: dict,
    now: Optional[datetime] = None,
    meal_context: Optional[dict] = None,
) -> dict[str, float]:
    ingredients = recipe_ingredient_texts(recipe)
    text = " ".join(ingredients).lower()
    nutrition, nutrition_present = recipe_nutrition_with_presence(recipe)
    calories, fat, sugar, sodium, protein, sat_fat, carbs = nutrition
    now = now or datetime.now(timezone.utc)
    hour = now.hour + now.minute / 60
    recipe = recipe or {}
    meal_context = meal_context or {}

    minutes = optional_finite_float(recipe.get("minutes"), minimum=0.0)
    explicit_ingredient_count = optional_finite_float(recipe.get("n_ingredients"), minimum=0.0)
    ingredient_count = (
        explicit_ingredient_count
        if explicit_ingredient_count is not None
        else (float(len(ingredients)) if ingredients else None)
    )
    step_count = optional_finite_float(recipe.get("n_steps"), minimum=0.0)
    if step_count is None and isinstance(recipe.get("steps"), list):
        step_count = float(len(recipe["steps"]))

    source = str(meal_context.get("nutrition_source") or "").strip().lower()
    logged_calories = optional_finite_float(meal_context.get("calories"), minimum=0.0)
    # Existing catalog_recipe rows contain Food.com %DV copied into *_g.
    # Only user-entered/manual or Gemini-estimated rows have gram semantics.
    gram_macros_are_valid = source in {"manual", "gemini_estimate"}
    logged_protein = (
        optional_finite_float(meal_context.get("protein_g"), minimum=0.0)
        if gram_macros_are_valid
        else None
    )
    logged_fat = (
        optional_finite_float(meal_context.get("fat_g"), minimum=0.0)
        if gram_macros_are_valid
        else None
    )
    logged_portion = optional_finite_float(meal_context.get("portion_size"), minimum=0.0)
    logged_nutrition_confidence = optional_finite_float(
        meal_context.get("nutrition_confidence"), minimum=0.0
    )
    if logged_nutrition_confidence is not None:
        logged_nutrition_confidence = clamp01(logged_nutrition_confidence)

    trigger_profile = build_recipe_trigger_profile(recipe)
    recent_symptom_max = optional_finite_float(
        recent_context.get("recent_symptom_max", recent_context.get("recent_symptom_severity")),
        minimum=0.0,
    ) or 0.0
    recent_symptom_mean = optional_finite_float(
        recent_context.get("recent_symptom_mean"), minimum=0.0
    ) or 0.0

    row = {
        # Legacy artifact compatibility.
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
        "recent_symptom_severity": recent_symptom_max,
        "recent_meal_count": float(recent_context.get("recent_meal_count") or 0),
        # V2 recipe and causal-context features. Personalized/logged-meal/time
        # keys remain in the row only for compatibility with older artifacts;
        # newly trained FEATURE_COLUMNS exclude values that cannot be
        # reproduced precisely while ranking a future meal.
        "catalog_recipe_present": float(
            bool(recipe.get("_catalog_recipe_present", recipe.get("id") is not None))
        ),
        "recipe_ingredients_missing": float(not bool(ingredients)),
        "recipe_ingredient_count_missing": float(ingredient_count is None),
        "recipe_nutrition_missing": float(not nutrition_present),
        "recipe_minutes_missing": float(minutes is None),
        "recipe_step_count_missing": float(step_count is None),
        "recipe_calories": calories,
        "recipe_fat_pdv": fat,
        "recipe_sugar_pdv": sugar,
        "recipe_sodium_pdv": sodium,
        "recipe_protein_pdv": protein,
        "recipe_sat_fat_pdv": sat_fat,
        "recipe_carbs_pdv": carbs,
        "recipe_minutes": minutes or 0.0,
        "recipe_ingredient_count": ingredient_count or 0.0,
        "recipe_step_count": step_count or 0.0,
        **trigger_profile,
        "ingredient_risk_score": ingredient_risk.score,
        "ingredient_risk_confidence": ingredient_risk.confidence,
        "personal_risk_match_count": float(ingredient_risk.personal_match_count),
        "personal_risk_coverage": ingredient_risk.personal_coverage,
        "recent_symptom_max": recent_symptom_max,
        "recent_symptom_mean": recent_symptom_mean,
        "recent_no_symptom_fraction": clamp01(
            float(recent_context.get("recent_no_symptom_fraction") or 0)
        ),
        "recent_positive_report_count": float(
            recent_context.get("recent_positive_report_count") or 0
        ),
        "recent_trigger_load": clamp01(
            float(recent_context.get("recent_trigger_load") or 0)
        ),
        "hours_since_last_symptom": float(
            recent_context.get("hours_since_last_symptom", RECENT_CONTEXT_WINDOW_HOURS)
        ),
        "hours_since_last_symptom_missing": float(
            recent_context.get("hours_since_last_symptom_missing", 1)
        ),
        "hours_since_last_meal": float(
            recent_context.get("hours_since_last_meal", RECENT_CONTEXT_WINDOW_HOURS)
        ),
        "hours_since_last_meal_missing": float(
            recent_context.get("hours_since_last_meal_missing", 1)
        ),
        "logged_calories": logged_calories or 0.0,
        "logged_calories_missing": float(logged_calories is None),
        "logged_protein_g": logged_protein or 0.0,
        "logged_protein_g_missing": float(logged_protein is None),
        "logged_fat_g": logged_fat or 0.0,
        "logged_fat_g_missing": float(logged_fat is None),
        "logged_portion_size": logged_portion or 0.0,
        "logged_portion_size_missing": float(logged_portion is None),
        "logged_nutrition_confidence": logged_nutrition_confidence or 0.0,
        "logged_nutrition_confidence_missing": float(logged_nutrition_confidence is None),
        **portion_unit_features(meal_context.get("portion_unit")),
        "time_of_day_sin": math.sin(2 * math.pi * hour / 24),
        "time_of_day_cos": math.cos(2 * math.pi * hour / 24),
    }
    return row


def validate_symptom_model_artifact(artifact: Any) -> dict:
    if not isinstance(artifact, dict) or "model" not in artifact:
        raise ValueError("symptom artifact must be a dictionary containing a model")

    model = artifact["model"]
    if not (
        callable(getattr(model, "predict_proba", None))
        or callable(getattr(model, "predict", None))
    ):
        raise ValueError("symptom artifact model has no prediction interface")

    columns = artifact.get("feature_columns")
    model_feature_count = getattr(model, "n_features_in_", None)
    if columns is None:
        if model_feature_count == len(LEGACY_FEATURE_COLUMNS):
            columns = LEGACY_FEATURE_COLUMNS
        elif model_feature_count == len(FEATURE_COLUMNS):
            columns = FEATURE_COLUMNS
        else:
            raise ValueError(
                "symptom artifact has no feature_columns and its fitted feature "
                "count does not match a supported schema"
            )
    if (
        not isinstance(columns, (list, tuple))
        or not columns
        or any(not isinstance(column, str) or not column for column in columns)
        or len(columns) != len(set(columns))
    ):
        raise ValueError("symptom artifact feature_columns are invalid")

    unknown_columns = set(columns) - SUPPORTED_SYMPTOM_MODEL_FEATURES
    if unknown_columns:
        raise ValueError(
            "symptom artifact uses unsupported feature columns: "
            + ", ".join(sorted(unknown_columns))
        )
    if model_feature_count is not None and int(model_feature_count) != len(columns):
        raise ValueError(
            "symptom artifact model feature count does not match feature_columns"
        )

    validated = dict(artifact)
    validated["feature_columns"] = list(columns)
    return validated


def load_symptom_model(path: Path = SYMPTOM_MODEL_PATH) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        with path.open("rb") as file:
            artifact = pickle.load(file)
        return validate_symptom_model_artifact(artifact)
    except Exception as exc:
        print(f"[Warning] Failed to load symptom model artifact: {exc}")
        return None


def heuristic_symptom_risk(feature_row: dict[str, float], ingredient_risk: float) -> float:
    fat_load = clamp01(feature_row.get("recipe_fat_pdv", feature_row.get("fat", 0)) / 40)
    calorie_load = clamp01(
        feature_row.get("recipe_calories", feature_row.get("calories", 0)) / 700
    )
    if "trigger_group_count" in feature_row:
        trigger_load = clamp01(feature_row.get("trigger_group_count", 0) / 4)
    else:
        trigger_flags = (
            feature_row.get("contains_garlic", 0)
            + feature_row.get("contains_onion", 0)
            + feature_row.get("contains_wheat", 0)
            + feature_row.get("contains_lactose", 0)
            + feature_row.get("contains_polyols", 0)
        )
        trigger_load = clamp01(trigger_flags / 3)
    recent = clamp01(
        feature_row.get("recent_symptom_max", feature_row.get("recent_symptom_severity", 0))
    )
    recent_trigger_load = clamp01(feature_row.get("recent_trigger_load", 0))
    return clamp01(
        0.08
        + 0.52 * ingredient_risk
        + 0.12 * fat_load
        + 0.08 * calorie_load
        + 0.10 * trigger_load
        + 0.06 * recent
        + 0.04 * recent_trigger_load
    )


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
            model = artifact["model"]
            columns = artifact.get("feature_columns")
            if not columns:
                model_feature_count = getattr(model, "n_features_in_", None)
                columns = (
                    LEGACY_FEATURE_COLUMNS
                    if model_feature_count == len(LEGACY_FEATURE_COLUMNS)
                    else FEATURE_COLUMNS
                )
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
