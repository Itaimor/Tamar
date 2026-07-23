from __future__ import annotations

import sys
import types
import unittest
import pickle
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


def has_real_ml_stack() -> bool:
    try:
        import numpy
        import pandas
        import sklearn
    except ImportError:
        return False
    return all(getattr(module, "__file__", None) for module in (numpy, pandas, sklearn))


HAS_REAL_ML_STACK = has_real_ml_stack()


def install_unit_import_stubs() -> None:
    try:
        import numpy  # noqa: F401
    except ImportError:
        numpy_stub = types.ModuleType("numpy")
        numpy_stub.mean = lambda values: sum(values) / len(values)
        numpy_stub.ndarray = list
        sys.modules["numpy"] = numpy_stub

    try:
        import pandas  # noqa: F401
    except ImportError:
        pandas_stub = types.ModuleType("pandas")
        pandas_stub.DataFrame = object
        pandas_stub.Series = object
        sys.modules["pandas"] = pandas_stub

    try:
        import sklearn  # noqa: F401
    except ImportError:
        sklearn_stub = types.ModuleType("sklearn")
        sklearn_stub.__path__ = []
        ensemble_stub = types.ModuleType("sklearn.ensemble")
        ensemble_stub.GradientBoostingClassifier = object
        metrics_stub = types.ModuleType("sklearn.metrics")
        metrics_stub.brier_score_loss = lambda *_args, **_kwargs: 0.0
        metrics_stub.log_loss = lambda *_args, **_kwargs: 0.0
        metrics_stub.roc_auc_score = lambda *_args, **_kwargs: 0.5
        model_selection_stub = types.ModuleType("sklearn.model_selection")
        model_selection_stub.GroupShuffleSplit = object
        model_selection_stub.train_test_split = lambda *_args, **_kwargs: ([], [])
        sys.modules.update(
            {
                "sklearn": sklearn_stub,
                "sklearn.ensemble": ensemble_stub,
                "sklearn.metrics": metrics_stub,
                "sklearn.model_selection": model_selection_stub,
            }
        )

    try:
        from supabase import Client, create_client  # noqa: F401
    except ImportError:
        supabase_stub = types.ModuleType("supabase")
        supabase_stub.Client = object
        supabase_stub.create_client = lambda *_args, **_kwargs: None
        sys.modules["supabase"] = supabase_stub

    try:
        import dotenv  # noqa: F401
    except ImportError:
        dotenv_stub = types.ModuleType("dotenv")
        dotenv_stub.load_dotenv = lambda *_args, **_kwargs: False
        sys.modules["dotenv"] = dotenv_stub


install_unit_import_stubs()

RECOMMENDER_DIR = Path(__file__).resolve().parents[1]
if str(RECOMMENDER_DIR) not in sys.path:
    sys.path.insert(0, str(RECOMMENDER_DIR))

import pandas as pd
import risk_scoring

from risk_scoring import (
    FEATURE_COLUMNS,
    FEATURE_SCHEMA_VERSION,
    LEGACY_FEATURE_COLUMNS,
    IngredientRiskResult,
    IngredientRiskSignal,
    build_feature_row,
    compute_recipe_ingredient_risk,
    predict_symptom_risks,
    load_symptom_model,
    summarize_recent_context,
)
from train_symptom_model import (
    label_for_meal,
    match_meals_to_outcomes,
    split_training_examples,
)
from recommend_fast import download_symptom_artifact_from_storage


UTC = timezone.utc


class PickleableSymptomModel:
    n_features_in_ = len(FEATURE_COLUMNS)

    def predict_proba(self, _matrix):
        return [[0.5, 0.5]]


class FakeSymptomStorageBucket:
    def __init__(self, payload: bytes):
        self.payload = payload

    def download(self, _storage_path: str) -> bytes:
        return self.payload


class FakeSymptomStorage:
    def __init__(self, payload: bytes):
        self.payload = payload

    def from_(self, _bucket: str) -> FakeSymptomStorageBucket:
        return FakeSymptomStorageBucket(self.payload)


class FakeSymptomSupabase:
    def __init__(self, payload: bytes):
        self.storage = FakeSymptomStorage(payload)


def no_personal_risk() -> IngredientRiskResult:
    return IngredientRiskResult(
        score=0.2,
        confidence=0.1,
        matched_ingredients=[],
        max_personal_risk=0.0,
        mean_personal_risk=0.0,
        mean_personal_confidence=0.0,
    )


class SymptomFeatureV2Tests(unittest.TestCase):
    def test_schema_is_versioned_unique_and_keeps_legacy_row_keys(self) -> None:
        row = build_feature_row(
            recipe={"id": 1, "ingredients": ["rice"], "nutrition": [100, 1, 2, 3, 4, 5, 6]},
            ingredient_risk=no_personal_risk(),
            recent_context={},
            now=datetime(2026, 7, 23, 12, tzinfo=UTC),
        )

        self.assertEqual(FEATURE_SCHEMA_VERSION, 2)
        self.assertEqual(len(FEATURE_COLUMNS), len(set(FEATURE_COLUMNS)))
        self.assertTrue(set(FEATURE_COLUMNS).issubset(row))
        self.assertTrue(set(LEGACY_FEATURE_COLUMNS).issubset(row))
        self.assertNotIn("personal_risk_mean", FEATURE_COLUMNS)
        self.assertNotIn("ingredient_risk_score", FEATURE_COLUMNS)
        self.assertNotIn("time_of_day_sin", FEATURE_COLUMNS)

    def test_catalog_percent_daily_values_are_not_overwritten_by_logged_macros(self) -> None:
        row = build_feature_row(
            recipe={
                "id": 7,
                "ingredients": ["rice"],
                "nutrition": [500, 20, 30, 40, 50, 60, 70],
                "minutes": 25,
                "n_ingredients": 1,
                "n_steps": 4,
            },
            ingredient_risk=no_personal_risk(),
            recent_context={},
            meal_context={
                "nutrition_source": "catalog_recipe",
                "calories": 500,
                "protein_g": 999,
                "fat_g": 888,
            },
        )

        self.assertEqual(row["recipe_calories"], 500)
        self.assertEqual(row["recipe_fat_pdv"], 20)
        self.assertEqual(row["recipe_protein_pdv"], 50)
        self.assertEqual(row["recipe_carbs_pdv"], 70)
        self.assertEqual(row["logged_protein_g"], 0)
        self.assertEqual(row["logged_fat_g"], 0)
        self.assertEqual(row["logged_protein_g_missing"], 1)
        self.assertEqual(row["logged_fat_g_missing"], 1)

    def test_manual_logged_macros_and_portion_are_separate_features(self) -> None:
        row = build_feature_row(
            recipe={"id": 1, "ingredients": ["rice"], "nutrition": [200, 2, 1, 3, 4, 1, 8]},
            ingredient_risk=no_personal_risk(),
            recent_context={},
            meal_context={
                "nutrition_source": "manual",
                "calories": 320,
                "protein_g": 18,
                "fat_g": 9,
                "portion_size": 250,
                "portion_unit": "grams",
            },
        )

        self.assertEqual(row["logged_calories"], 320)
        self.assertEqual(row["logged_protein_g"], 18)
        self.assertEqual(row["logged_fat_g"], 9)
        self.assertEqual(row["logged_portion_size"], 250)
        self.assertEqual(row["portion_unit_grams"], 1)
        self.assertNotIn("logged_calories", FEATURE_COLUMNS)
        self.assertNotIn("logged_protein_g", FEATURE_COLUMNS)
        self.assertNotIn("logged_fat_g", FEATURE_COLUMNS)
        self.assertNotIn("logged_portion_size", FEATURE_COLUMNS)
        self.assertNotIn("portion_unit_grams", FEATURE_COLUMNS)

    def test_actual_recipe_counts_and_missing_flags_are_exposed(self) -> None:
        complete = build_feature_row(
            recipe={
                "id": 2,
                "ingredients": ["rice", "carrot"],
                "nutrition": [100, 1, 2, 3, 4, 5, 6],
                "minutes": 30,
                "n_ingredients": 2,
                "n_steps": 5,
            },
            ingredient_risk=no_personal_risk(),
            recent_context={},
        )
        missing = build_feature_row(None, no_personal_risk(), {})

        self.assertEqual(complete["recipe_minutes"], 30)
        self.assertEqual(complete["recipe_ingredient_count"], 2)
        self.assertEqual(complete["recipe_step_count"], 5)
        self.assertEqual(complete["recipe_nutrition_missing"], 0)
        self.assertEqual(missing["catalog_recipe_present"], 0)
        self.assertEqual(missing["recipe_ingredients_missing"], 1)
        self.assertEqual(missing["recipe_ingredient_count_missing"], 1)
        self.assertEqual(missing["recipe_nutrition_missing"], 1)
        self.assertEqual(missing["recipe_minutes_missing"], 1)
        self.assertEqual(missing["recipe_step_count_missing"], 1)

    def test_trigger_profiles_cover_all_groups_without_plant_milk_false_positive(self) -> None:
        row = build_feature_row(
            recipe={
                "id": 3,
                "ingredients": [
                    "garlic powder",
                    "almond flour",
                    "coconut milk",
                    "apple",
                    "avocado",
                    "broccoli",
                    "fried chicken",
                    "coffee",
                    "bran",
                ],
                "nutrition": [100, 1, 2, 3, 4, 5, 6],
            },
            ingredient_risk=no_personal_risk(),
            recent_context={},
        )

        self.assertEqual(row["trigger_fructans_gos_present"], 1)
        self.assertEqual(row["trigger_lactose_present"], 0)
        self.assertEqual(row["trigger_excess_fructose_present"], 1)
        self.assertEqual(row["trigger_polyols_present"], 1)
        self.assertEqual(row["trigger_gas_producing_present"], 1)
        self.assertEqual(row["trigger_fatty_spicy_processed_present"], 1)
        self.assertEqual(row["trigger_caffeine_alcohol_fizzy_present"], 1)
        self.assertEqual(row["trigger_fiber_sensitive_present"], 1)

    def test_trigger_aliases_match_directionally(self) -> None:
        positive = risk_scoring.build_recipe_trigger_profile(
            {"ingredients": ["plain flour", "whole milk", "heavy cream"]}
        )
        safe_broad_foods = risk_scoring.build_recipe_trigger_profile(
            {"ingredients": ["rice", "chicken", "water", "corn", "orange"]}
        )

        self.assertEqual(positive["trigger_fructans_gos_present"], 1)
        self.assertEqual(positive["trigger_lactose_present"], 1)
        for group in risk_scoring.TRIGGER_GROUPS:
            self.assertEqual(
                safe_broad_foods[f"trigger_{group}_present"],
                0,
                msg=f"broad ingredient was falsely classified for {group}",
            )

        mixed_non_dairy_and_dairy = risk_scoring.build_recipe_trigger_profile(
            {"ingredients": ["almond milk with whey protein"]}
        )
        self.assertEqual(
            mixed_non_dairy_and_dairy["trigger_lactose_present"],
            1,
        )

    def test_recent_trigger_load_averages_per_meal(self) -> None:
        reference_time = datetime(2026, 7, 23, 12, tzinfo=UTC)
        context = summarize_recent_context(
            reference_time,
            [
                {
                    "logged_at": (reference_time - timedelta(hours=2)).isoformat(),
                    "_trigger_load": 1.0,
                },
                {
                    "logged_at": (reference_time - timedelta(hours=1)).isoformat(),
                    "_trigger_load": 0.0,
                },
            ],
            [],
        )

        self.assertEqual(context["recent_meal_count"], 2)
        self.assertEqual(context["recent_trigger_load"], 0.5)

    def test_personal_risk_coverage_uses_personal_matches_only(self) -> None:
        result = compute_recipe_ingredient_risk(
            {"ingredients": ["garlic", "rice"]},
            [
                IngredientRiskSignal(
                    ingredient_name="garlic",
                    normalized_name="garlic",
                    risk_score=0.9,
                    confidence=0.8,
                    source="test",
                )
            ],
            [],
        )
        row = build_feature_row(
            {"id": 4, "ingredients": ["garlic", "rice"], "nutrition": [1, 2, 3, 4, 5, 6, 7]},
            result,
            {},
        )

        self.assertEqual(result.personal_match_count, 1)
        self.assertEqual(result.personal_coverage, 0.5)
        self.assertEqual(row["personal_risk_match_count"], 1)
        self.assertEqual(row["personal_risk_coverage"], 0.5)

    def test_personal_signal_matching_does_not_broaden_specific_foods(self) -> None:
        signal = IngredientRiskSignal(
            ingredient_name="brown rice",
            normalized_name="brown rice",
            risk_score=0.9,
            confidence=0.8,
            source="test",
        )

        broad_recipe = compute_recipe_ingredient_risk(
            {"ingredients": ["rice"]},
            [signal],
            [],
        )
        specific_recipe = compute_recipe_ingredient_risk(
            {"ingredients": ["cooked brown rice"]},
            [signal],
            [],
        )

        self.assertEqual(broad_recipe.personal_match_count, 0)
        self.assertEqual(specific_recipe.personal_match_count, 1)

        cream_signal = IngredientRiskSignal(
            ingredient_name="cream",
            normalized_name="cream",
            risk_score=0.9,
            confidence=0.8,
            source="test",
        )
        cream_of_tartar = compute_recipe_ingredient_risk(
            {"ingredients": ["cream of tartar"]},
            [cream_signal],
            [],
        )
        self.assertEqual(cream_of_tartar.personal_match_count, 0)

    def test_stored_legacy_feature_columns_still_drive_prediction(self) -> None:
        selected_columns: list[str] = []

        class FakeFrame:
            def __init__(self, rows):
                self.rows = rows

            def __getitem__(self, columns):
                selected_columns.extend(columns)
                for row in self.rows:
                    for column in columns:
                        row[column]
                return self

            def fillna(self, _value):
                return self

        class FakeProbabilities:
            def __getitem__(self, key):
                self.last_key = key
                return [0.25]

        class LegacyModel:
            def predict_proba(self, _matrix):
                return FakeProbabilities()

        row = build_feature_row(
            {"id": 1, "ingredients": ["rice"], "nutrition": [1, 2, 3, 4, 5, 6, 7]},
            no_personal_risk(),
            {},
        )
        with patch.object(risk_scoring.pd, "DataFrame", FakeFrame):
            result = predict_symptom_risks(
                [row],
                [0.2],
                {"model": LegacyModel(), "feature_columns": LEGACY_FEATURE_COLUMNS},
            )

        self.assertEqual(result, [0.25])
        self.assertEqual(selected_columns, LEGACY_FEATURE_COLUMNS)

    def test_symptom_artifact_validation_rejects_unknown_or_misaligned_schema(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "symptom.pkl"

            with artifact_path.open("wb") as file:
                pickle.dump(
                    {
                        "model": PickleableSymptomModel(),
                        "feature_columns": FEATURE_COLUMNS,
                    },
                    file,
                )
            self.assertIsNotNone(load_symptom_model(artifact_path))

            with artifact_path.open("wb") as file:
                pickle.dump(
                    {
                        "model": PickleableSymptomModel(),
                        "feature_columns": [*FEATURE_COLUMNS[:-1], "unknown_feature"],
                    },
                    file,
                )
            self.assertIsNone(load_symptom_model(artifact_path))

    def test_invalid_symptom_download_preserves_valid_cached_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "symptom.pkl"
            with artifact_path.open("wb") as file:
                pickle.dump(
                    {
                        "model": PickleableSymptomModel(),
                        "feature_columns": FEATURE_COLUMNS,
                    },
                    file,
                )
            original_bytes = artifact_path.read_bytes()

            usable = download_symptom_artifact_from_storage(
                FakeSymptomSupabase(b"not a pickle"),
                artifact_path=artifact_path,
                force=True,
            )

            self.assertTrue(usable)
            self.assertEqual(original_bytes, artifact_path.read_bytes())
            self.assertEqual([], list(Path(directory).glob("*.download")))

            with artifact_path.open("wb") as file:
                pickle.dump(
                    {
                        "model": PickleableSymptomModel(),
                        "feature_columns": FEATURE_COLUMNS[:-1],
                    },
                    file,
                )
            self.assertIsNone(load_symptom_model(artifact_path))


class CausalContextAndLabelTests(unittest.TestCase):
    def test_recent_context_uses_only_strictly_prior_rows(self) -> None:
        reference = datetime(2026, 7, 23, 12, tzinfo=UTC)
        context = summarize_recent_context(
            reference,
            meal_rows=[
                {"logged_at": (reference - timedelta(hours=2)).isoformat()},
                {"logged_at": reference.isoformat()},
                {"logged_at": (reference + timedelta(hours=1)).isoformat()},
                {"logged_at": (reference - timedelta(hours=49)).isoformat()},
            ],
            health_rows=[
                {
                    "reported_at": (reference - timedelta(hours=3)).isoformat(),
                    "severity": 0.8,
                    "no_symptoms": False,
                },
                {
                    "reported_at": (reference - timedelta(hours=1)).isoformat(),
                    "severity": 0,
                    "no_symptoms": True,
                },
                {
                    "reported_at": reference.isoformat(),
                    "severity": 1,
                    "no_symptoms": False,
                },
            ],
        )

        self.assertEqual(context["recent_meal_count"], 1)
        self.assertEqual(context["hours_since_last_meal"], 2)
        self.assertEqual(context["recent_symptom_max"], 0.8)
        self.assertAlmostEqual(context["recent_symptom_mean"], 0.4)
        self.assertEqual(context["recent_positive_report_count"], 1)
        self.assertEqual(context["recent_no_symptom_fraction"], 0.5)
        self.assertEqual(context["hours_since_last_symptom"], 3)

    def test_labels_require_explicit_negative_or_eligible_positive(self) -> None:
        logged_at = datetime(2026, 7, 23, 8, tzinfo=UTC)
        meal = {"user_id": "u1", "logged_at": logged_at.isoformat()}

        low_only = {
            "u1": [
                {
                    "reported_at": (logged_at + timedelta(hours=2)).isoformat(),
                    "symptom_type": "bloating",
                    "severity": 0.1,
                    "no_symptoms": False,
                }
            ]
        }
        explicit_negative = {
            "u1": [
                {
                    "reported_at": (logged_at + timedelta(hours=2)).isoformat(),
                    "symptom_type": "none",
                    "severity": 0,
                    "no_symptoms": True,
                }
            ]
        }
        positive = {
            "u1": [
                {
                    "reported_at": (logged_at + timedelta(hours=2)).isoformat(),
                    "symptom_type": "bloating",
                    "severity": 0.7,
                    "no_symptoms": False,
                }
            ]
        }
        too_late = {
            "u1": [
                {
                    "reported_at": (logged_at + timedelta(hours=49)).isoformat(),
                    "symptom_type": "bloating",
                    "severity": 0.7,
                    "no_symptoms": False,
                }
            ]
        }

        self.assertIsNone(label_for_meal(meal, low_only))
        self.assertEqual(label_for_meal(meal, explicit_negative), 0)
        self.assertEqual(label_for_meal(meal, positive), 1)
        self.assertIsNone(label_for_meal(meal, too_late))

    def test_one_report_labels_only_the_nearest_preceding_meal(self) -> None:
        base = datetime(2026, 7, 23, 8, tzinfo=UTC)
        earlier = {"id": 1, "logged_at": base.isoformat()}
        nearer = {"id": 2, "logged_at": (base + timedelta(hours=1)).isoformat()}
        report = {
            "reported_at": (base + timedelta(hours=2)).isoformat(),
            "symptom_type": "bloating",
            "severity": 0.7,
            "no_symptoms": False,
        }

        matches = match_meals_to_outcomes([earlier, nearer], [report])

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0][0]["id"], 2)
        self.assertEqual(matches[0][1], 1)

    def test_followup_report_does_not_cascade_to_an_older_meal(self) -> None:
        base = datetime(2026, 7, 23, 8, tzinfo=UTC)
        meals = [
            {"id": 1, "logged_at": base.isoformat()},
            {"id": 2, "logged_at": (base + timedelta(hours=1)).isoformat()},
        ]
        reports = [
            {
                "reported_at": (base + timedelta(hours=2)).isoformat(),
                "symptom_type": "bloating",
                "severity": 0.8,
                "no_symptoms": False,
            },
            {
                "reported_at": (base + timedelta(hours=3)).isoformat(),
                "symptom_type": "pain",
                "severity": 0.7,
                "no_symptoms": False,
            },
        ]

        matches = match_meals_to_outcomes(meals, reports)

        self.assertEqual(1, len(matches))
        self.assertEqual(2, matches[0][0]["id"])

@unittest.skipUnless(HAS_REAL_ML_STACK, "Full pandas/scikit-learn stack is not installed")
class TrainingSplitTests(unittest.TestCase):
    def test_group_split_has_no_user_overlap_when_possible(self) -> None:
        data = pd.DataFrame({"value": list(range(16))})
        target = pd.Series([0, 1] * 8)
        groups = pd.Series([f"user-{index // 2}" for index in range(16)])
        timestamps = pd.Series(
            [datetime(2026, 7, 1, tzinfo=UTC) + timedelta(hours=index) for index in range(16)]
        )

        x_train, x_test, _y_train, _y_test, strategy = split_training_examples(
            data,
            target,
            groups,
            timestamps,
        )

        self.assertEqual(strategy, "group_disjoint")
        train_groups = set(groups.iloc[x_train.index])
        test_groups = set(groups.iloc[x_test.index])
        self.assertTrue(train_groups.isdisjoint(test_groups))

    def test_chronological_split_purges_labels_unavailable_at_test_time(self) -> None:
        count = 12
        base = datetime(2026, 7, 1, tzinfo=UTC)
        data = pd.DataFrame({"value": list(range(count))})
        target = pd.Series([0, 1] * (count // 2))
        groups = pd.Series(["one-user"] * count)
        meal_times = pd.Series(
            [base + timedelta(hours=index * 12) for index in range(count)]
        )
        outcome_times = meal_times + pd.to_timedelta(
            [1] * 8 + [48] + [1] * 3,
            unit="h",
        )

        x_train, x_test, _y_train, _y_test, strategy = split_training_examples(
            data,
            target,
            groups,
            meal_times,
            outcome_times,
        )

        self.assertEqual(strategy, "chronological_purged")
        self.assertNotIn(8, x_train.index)
        first_test_meal = min(meal_times.iloc[x_test.index])
        self.assertTrue(
            all(outcome_times.iloc[index] < first_test_meal for index in x_train.index)
        )

    def test_no_random_row_holdout_is_used_when_safe_split_is_impossible(self) -> None:
        count = 8
        base = datetime(2026, 7, 1, tzinfo=UTC)
        data = pd.DataFrame({"value": list(range(count))})
        target = pd.Series([0, 1] * (count // 2))
        groups = pd.Series(["one-user"] * count)
        meal_times = pd.Series(
            [base + timedelta(hours=index) for index in range(count)]
        )
        outcome_times = pd.Series(
            [base + timedelta(hours=count + index) for index in range(count)]
        )

        x_train, x_test, y_train, y_test, strategy = split_training_examples(
            data,
            target,
            groups,
            meal_times,
            outcome_times,
        )

        self.assertEqual(strategy, "no_valid_holdout")
        self.assertEqual(len(x_train), count)
        self.assertEqual(len(y_train), count)
        self.assertTrue(x_test.empty)
        self.assertTrue(y_test.empty)


if __name__ == "__main__":
    unittest.main()
