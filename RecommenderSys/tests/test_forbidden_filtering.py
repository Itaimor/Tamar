from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


def install_pure_unit_import_stubs() -> None:
    """Keep the safety tests runnable without the optional service stack.

    Production installs use the real packages from requirements-service.txt.
    The fallbacks below expose only the tiny surface needed to import and test
    the pure filtering helpers; they must never be used by application code.
    """

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
        sys.modules["pandas"] = pandas_stub

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


install_pure_unit_import_stubs()

RECOMMENDER_DIR = Path(__file__).resolve().parents[1]
if str(RECOMMENDER_DIR) not in sys.path:
    sys.path.insert(0, str(RECOMMENDER_DIR))

import risk_scoring
from risk_scoring import (
    RestrictionDataUnavailableError,
    STRICT_RESTRICTION_TYPES,
    fetch_user_restrictions,
    is_hard_filtered,
    rerank_candidates,
)


def strict_restriction(
    ingredient_name: str = "peanut",
    restriction_type: str = "forbidden_ingredient",
) -> dict:
    return {
        "ingredient_name": ingredient_name,
        "normalized_name": ingredient_name,
        "restriction_type": restriction_type,
        "severity": "strict",
        "is_strict": True,
    }


class ForbiddenIngredientMatchingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.restrictions = [strict_restriction()]

    def test_forbidden_ingredient_matches_exact_ingredient(self) -> None:
        recipe = {"ingredients": ["peanut"]}

        self.assertTrue(is_hard_filtered(recipe, self.restrictions))

    def test_forbidden_ingredient_matches_compound_ingredient(self) -> None:
        recipes = [
            {"ingredients": ["peanut butter"]},
            {"ingredients": ["dry roasted peanut oil"]},
            {"ingredients": ["2 tablespoons peanut paste"]},
        ]

        for recipe in recipes:
            with self.subTest(recipe=recipe):
                self.assertTrue(is_hard_filtered(recipe, self.restrictions))

    def test_forbidden_ingredient_matches_plural_and_hyphen_variants(self) -> None:
        """Canonical matching must not let formatting variants bypass a ban."""
        recipes = [
            {"ingredients": ["peanuts"]},
            {"ingredients": ["peanut-butter"]},
            {"ingredients": ["salted-peanuts"]},
        ]

        for recipe in recipes:
            with self.subTest(recipe=recipe):
                self.assertTrue(is_hard_filtered(recipe, self.restrictions))

    def test_forbidden_ingredient_does_not_match_safe_near_names(self) -> None:
        recipes = [
            {"ingredients": ["pea protein"]},
            {"ingredients": ["chickpeas"]},
            {"ingredients": ["walnut oil"]},
            {"ingredients": ["almond butter"]},
        ]

        for recipe in recipes:
            with self.subTest(recipe=recipe):
                self.assertFalse(is_hard_filtered(recipe, self.restrictions))

    def test_common_allergen_aliases_are_filtered_without_false_dairy_match(self) -> None:
        cases = [
            ("soy", "roasted soybeans", True),
            ("tree nuts", "walnut oil", True),
            ("nuts", "almond butter", True),
            ("shellfish", "grilled shrimp", True),
            ("dairy", "cream of tartar", False),
            ("cream", "cream of tartar", False),
            ("dairy", "almond milk with whey protein", True),
            ("milk", "almond milk plus milk powder", True),
            ("cream", "cream of tartar and heavy cream", True),
        ]

        for restricted_name, ingredient, expected in cases:
            with self.subTest(restricted_name=restricted_name, ingredient=ingredient):
                self.assertEqual(
                    is_hard_filtered(
                        {"ingredients": [ingredient]},
                        [strict_restriction(ingredient_name=restricted_name)],
                    ),
                    expected,
                )

    def test_every_strict_restriction_type_is_a_hard_filter(self) -> None:
        expected_types = {
            "allergy",
            "strict_sensitivity",
            "forbidden_ingredient",
            "diet_violation",
        }
        self.assertEqual(STRICT_RESTRICTION_TYPES, expected_types)

        for restriction_type in expected_types:
            with self.subTest(restriction_type=restriction_type):
                self.assertTrue(
                    is_hard_filtered(
                        {"ingredients": ["peanut butter"]},
                        [strict_restriction(restriction_type=restriction_type)],
                    )
                )

    def test_missing_recipe_metadata_fails_closed_when_restrictions_are_active(self) -> None:
        self.assertTrue(is_hard_filtered(None, self.restrictions))

    def test_missing_ingredient_metadata_fails_closed_when_restrictions_are_active(self) -> None:
        recipes = [
            {},
            {"ingredients": None},
            {"ingredients": []},
            {"ingredients": ""},
        ]

        for recipe in recipes:
            with self.subTest(recipe=recipe):
                self.assertTrue(is_hard_filtered(recipe, self.restrictions))

    def test_missing_metadata_is_not_filtered_without_restrictions(self) -> None:
        self.assertFalse(is_hard_filtered(None, []))
        self.assertFalse(is_hard_filtered({"ingredients": []}, []))


class ForbiddenIngredientRerankingTests(unittest.TestCase):
    def test_forbidden_candidate_is_removed_before_symptom_prediction(self) -> None:
        candidates = [("101", 10.0), ("202", 1.0)]
        recipes_meta = {
            "101": {
                "id": 101,
                "ingredients": ["peanut butter"],
                "nutrition": [200, 8, 2, 100, 5, 1, 20],
            },
            "202": {
                "id": 202,
                "ingredients": ["rice", "carrot"],
                "nutrition": [180, 2, 1, 80, 4, 0.5, 35],
            },
        }

        with patch.object(
            risk_scoring,
            "predict_symptom_risks",
            return_value=[0.1],
        ) as predict_symptom_risks:
            result = rerank_candidates(
                candidates=candidates,
                recipes_meta=recipes_meta,
                restrictions=[strict_restriction()],
                personal_signals=[],
                population_signals=[],
                recent_context={},
            )

        self.assertEqual([candidate.recipe_id for candidate in result], ["202"])
        predict_symptom_risks.assert_called_once()
        feature_rows, ingredient_risks = predict_symptom_risks.call_args.args[:2]
        self.assertEqual(len(feature_rows), 1)
        self.assertEqual(len(ingredient_risks), 1)

    def test_candidate_without_recipe_metadata_does_not_survive_reranking(self) -> None:
        with patch.object(
            risk_scoring,
            "predict_symptom_risks",
            return_value=[],
        ) as predict_symptom_risks:
            result = rerank_candidates(
                candidates=[("missing", 100.0)],
                recipes_meta={},
                restrictions=[strict_restriction()],
                personal_signals=[],
                population_signals=[],
                recent_context={},
            )

        self.assertEqual(result, [])
        predict_symptom_risks.assert_called_once_with([], [])


class RestrictionFetchSafetyTests(unittest.TestCase):
    def test_restriction_query_failure_aborts_instead_of_disabling_filters(self) -> None:
        class BrokenSupabase:
            def table(self, _table_name):
                raise RuntimeError("database unavailable")

        with self.assertRaises(RestrictionDataUnavailableError):
            fetch_user_restrictions(BrokenSupabase(), "user-1")


class PersonalCookbookForbiddenIngredientTests(unittest.TestCase):
    @staticmethod
    def score_personal_recipe(ingredients: str | None):
        from recommend_fast import compute_personal_cookbook_score

        now = datetime(2026, 7, 23, tzinfo=timezone.utc)
        return compute_personal_cookbook_score(
            item={
                "recipe_id": "personal-test",
                "recipe_title": "Personal test recipe",
                "ingredients": ingredients,
                "latest_at": now,
                "cooklist_count": 1,
            },
            restrictions=[strict_restriction()],
            personal_signals=[],
            population_signals=[],
            recent_context={},
            now=now,
        )

    def test_personal_recipe_with_forbidden_ingredient_is_not_recommended(self) -> None:
        self.assertIsNone(self.score_personal_recipe("rice, peanut butter, carrot"))

    def test_personal_recipe_with_safe_ingredients_can_be_recommended(self) -> None:
        self.assertIsNotNone(self.score_personal_recipe("rice, carrot, spinach"))

    def test_personal_recipe_without_ingredient_metadata_fails_closed(self) -> None:
        for ingredients in (None, "", "   "):
            with self.subTest(ingredients=ingredients):
                self.assertIsNone(self.score_personal_recipe(ingredients))


@unittest.skipUnless(
    importlib.util.find_spec("fastapi") is not None
    and importlib.util.find_spec("pydantic") is not None,
    "FastAPI/Pydantic service dependencies are not installed",
)
class RestrictionRequestValidationTests(unittest.TestCase):
    def test_forbidden_restriction_request_normalizes_surrounding_whitespace(self) -> None:
        from recommender_service import RestrictionRequest

        request = RestrictionRequest(
            user_id="test-user",
            ingredient_name="  peanut  ",
            restriction_type="forbidden_ingredient",
        )

        self.assertEqual(request.ingredient_name, "peanut")

    def test_restriction_request_rejects_blank_ingredient_name(self) -> None:
        from pydantic import ValidationError
        from recommender_service import RestrictionRequest

        with self.assertRaises(ValidationError):
            RestrictionRequest(
                user_id="test-user",
                ingredient_name="   ",
                restriction_type="forbidden_ingredient",
            )

    def test_restriction_request_rejects_unknown_type_and_severity(self) -> None:
        from pydantic import ValidationError
        from recommender_service import RestrictionRequest

        with self.assertRaises(ValidationError):
            RestrictionRequest(
                user_id="test-user",
                ingredient_name="peanut",
                restriction_type="preference",
            )

        with self.assertRaises(ValidationError):
            RestrictionRequest(
                user_id="test-user",
                ingredient_name="peanut",
                restriction_type="forbidden_ingredient",
                severity="urgent",
            )


if __name__ == "__main__":
    unittest.main()
