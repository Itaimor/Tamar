from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from scipy import sparse


RECOMMENDER_DIR = Path(__file__).resolve().parents[1]
if str(RECOMMENDER_DIR) not in sys.path:
    sys.path.insert(0, str(RECOMMENDER_DIR))

from lightfm_features import (  # noqa: E402
    MAX_ITEM_INGREDIENT_FEATURES,
    build_item_feature_rows,
    build_user_feature_rows,
    recipe_feature_weights,
)
from recommend_batch import (  # noqa: E402
    LightFMTrainingResult,
    create_artifact_staging_path,
    home_excluded_recipe_ids,
    interactions_through_training_boundary,
    lightfm_predictions_for_user,
    positive_lightfm_ratings,
    postprocess_artifact_with_metadata,
    preference_model_generation_name,
    promote_staged_artifact,
    replace_candidate_rows,
    save_lightfm_item_artifact,
    train_lightfm_preference_model,
    zero_cold_identity_features,
)
from recommend_fast import (  # noqa: E402
    apply_bounded_online_delta,
    blend_user_vectors,
    build_user_vector,
    download_artifact_from_storage,
    effective_online_vector_weight,
    fetch_user_interactions,
    get_flavor_artifact,
    get_learned_user_state,
    interactions_for_online_update,
    load_cf_artifact,
    reconstruct_artifact_scores,
    rescore_precomputed_candidates,
)
from recommender_common import process_interactions_to_ratings  # noqa: E402
import recommend_batch  # noqa: E402
import recommend_fast  # noqa: E402


class FakeLightFMModel:
    no_components = 2

    def __init__(self) -> None:
        self.item_features_seen = None
        self.user_features_seen = None
        self.predict_kwargs = None

    def get_item_representations(self, features):
        self.item_features_seen = features
        return (
            np.array([0.10, 0.20, 0.30]),
            np.array([[1.0, 0.0], [0.0, 2.0], [1.0, 1.0]]),
        )

    def get_user_representations(self, features):
        self.user_features_seen = features
        return (
            np.array([0.40, 0.50]),
            np.array([[2.0, 0.0], [0.0, 3.0]]),
        )

    def predict(self, user_id, item_ids, **kwargs):
        self.predict_kwargs = kwargs
        return np.asarray(item_ids, dtype=float)


class FakeSparseMatrix:
    def __init__(self, values) -> None:
        self.values = np.asarray(values, dtype=float)

    def tolil(self, copy=True):
        values = self.values.copy() if copy else self.values
        return FakeSparseMatrix(values)

    def __setitem__(self, key, value):
        self.values[key] = value

    def tocsr(self):
        return self

    def eliminate_zeros(self):
        return None


class FakeCandidateQuery:
    def __init__(self, calls: list[tuple]) -> None:
        self.calls = calls

    def delete(self):
        self.calls.append(("delete",))
        return self

    def eq(self, column, value):
        self.calls.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.calls.append(("in", column, list(values)))
        return self

    def upsert(self, rows, on_conflict):
        self.calls.append(("upsert", list(rows), on_conflict))
        return self

    def execute(self):
        self.calls.append(("execute",))
        return object()


class FakeCandidateSupabase:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def table(self, table_name):
        self.calls.append(("table", table_name))
        return FakeCandidateQuery(self.calls)


class FakeStorageDownload:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload

    def from_(self, _bucket):
        return self

    def download(self, _path):
        return self.payload


class FakeStorageSupabase:
    def __init__(self, payload: bytes) -> None:
        self.storage = FakeStorageDownload(payload)


class FakePagedInteractionQuery:
    def __init__(self, pages: dict[int, list[dict]], calls: list[tuple]) -> None:
        self.pages = pages
        self.calls = calls
        self.start = 0

    def select(self, columns):
        self.calls.append(("select", columns))
        return self

    def eq(self, column, value):
        self.calls.append(("eq", column, value))
        return self

    def order(self, column):
        self.calls.append(("order", column))
        return self

    def range(self, start, end):
        self.start = start
        self.calls.append(("range", start, end))
        return self

    def execute(self):
        return type("Response", (), {"data": self.pages.get(self.start, [])})()


class FakePagedInteractionSupabase:
    def __init__(self, pages: dict[int, list[dict]]) -> None:
        self.pages = pages
        self.calls: list[tuple] = []

    def table(self, table_name):
        self.calls.append(("table", table_name))
        return FakePagedInteractionQuery(self.pages, self.calls)


class LightFMFeatureTests(unittest.TestCase):
    def test_recipe_features_use_real_metadata_and_bound_ingredients(self):
        recipe = {
            "id": 7,
            "minutes": 28,
            "n_steps": 8,
            "n_ingredients": 40,
            "ingredients": [f"Ingredient {index}" for index in range(40)],
            "nutrition": [350, 12, 9, 22, 22, 5, 48],
            "is_ibs_friendly": True,
        }

        features = recipe_feature_weights(recipe)
        ingredient_features = [
            name for name in features if name.startswith("item:ingredient:")
        ]

        self.assertEqual(MAX_ITEM_INGREDIENT_FEATURES, len(ingredient_features))
        self.assertIn("item:minutes:le_30", features)
        self.assertIn("item:nutrition:calories:le_500", features)
        self.assertIn("item:nutrition:sodium:le_30", features)
        self.assertIn("item:nutrition:protein:le_30", features)
        self.assertIn("item:ibs_friendly:True", features)

    def test_user_features_are_rich_for_active_users_but_bounded_for_history(self):
        item_rows = build_item_feature_rows(
            [
                {
                    "id": 1,
                    "minutes": 20,
                    "n_steps": 5,
                    "n_ingredients": 2,
                    "ingredients": ["rice", "ginger"],
                    "nutrition": [250, 4, 2, 200, 8, 1, 40],
                }
            ],
            ["1"],
        )
        ratings = pd.DataFrame(
            [
                {"user_id": "active", "recipe_id": "1", "rating": 5.0},
                {"user_id": "hist_1", "recipe_id": "1", "rating": 5.0},
            ]
        )

        rows = build_user_feature_rows(
            user_ids=["active", "hist_1"],
            active_user_ids=["active"],
            ratings=ratings,
            item_feature_rows=item_rows,
            restrictions=[
                {
                    "user_id": "active",
                    "normalized_name": "milk",
                    "restriction_type": "allergy",
                }
            ],
            ingredient_risks=[
                {
                    "user_id": "active",
                    "normalized_name": "garlic",
                    "risk_score": 0.8,
                    "confidence": 0.7,
                }
            ],
            ibs_ingredient_risks=[
                {
                    "user_id": "active",
                    "trigger_group": "lactose",
                    "grade": 0.7,
                    "confidence": 0.8,
                }
            ],
        )

        self.assertTrue(any(name.startswith("user:taste:") for name in rows["active"]))
        self.assertIn("user:restriction_type:allergy", rows["active"])
        self.assertIn("user:restricted_ingredient:milk", rows["active"])
        self.assertIn("user:ibs_group:lactose:high", rows["active"])
        self.assertFalse(any(name.startswith("user:taste:") for name in rows["hist_1"]))

    def test_low_historical_ratings_do_not_become_warp_positives(self):
        ratings = pd.DataFrame(
            [
                {"user_id": "hist_low", "recipe_id": "1", "rating": 3.0},
                {"user_id": "hist_liked", "recipe_id": "1", "rating": 4.0},
                {"user_id": "active", "recipe_id": "1", "rating": 1.5},
                {"user_id": "active", "recipe_id": "missing", "rating": 5.0},
            ]
        )

        positives = positive_lightfm_ratings(
            ratings,
            ["1"],
            historical_min_rating=4.0,
        )

        self.assertEqual(
            [("hist_liked", 4.0), ("active", 1.5)],
            list(zip(positives["user_id"], positives["rating"])),
        )

    def test_cold_identity_is_zeroed_without_removing_side_features(self):
        matrix = FakeSparseMatrix(
            [
                [1.0, 0.0, 2.0],
                [0.0, 1.0, 3.0],
            ]
        )

        result = zero_cold_identity_features(
            matrix,
            entity_id_map={"warm": 0, "cold": 1},
            feature_name_map={"warm": 0, "cold": 1, "side": 2},
            warm_entity_ids={"warm"},
        )

        np.testing.assert_allclose(
            result.values,
            [
                [1.0, 0.0, 2.0],
                [0.0, 0.0, 3.0],
            ],
        )

    def test_training_fit_receives_both_side_feature_matrices(self):
        class FakeDataset:
            def fit(self, users, items, user_features, item_features):
                self.users = list(users)
                self.items = list(items)
                self.user_feature_names = list(user_features)
                self.item_feature_names = list(item_features)
                self.user_id_map = {
                    user_id: index for index, user_id in enumerate(self.users)
                }
                self.item_id_map = {
                    item_id: index for index, item_id in enumerate(self.items)
                }
                self.user_feature_map = {
                    **self.user_id_map,
                    **{
                        name: len(self.users) + index
                        for index, name in enumerate(self.user_feature_names)
                    },
                }
                self.item_feature_map = {
                    **self.item_id_map,
                    **{
                        name: len(self.items) + index
                        for index, name in enumerate(self.item_feature_names)
                    },
                }

            def mapping(self):
                return (
                    self.user_id_map,
                    self.user_feature_map,
                    self.item_id_map,
                    self.item_feature_map,
                )

            def build_interactions(self, triples):
                triples = list(triples)
                rows = [self.user_id_map[user_id] for user_id, _item_id, _ in triples]
                columns = [
                    self.item_id_map[item_id]
                    for _user_id, item_id, _ in triples
                ]
                values = [1.0] * len(triples)
                weights = [weight for _user_id, _item_id, weight in triples]
                shape = (len(self.users), len(self.items))
                return (
                    sparse.coo_matrix((values, (rows, columns)), shape=shape),
                    sparse.coo_matrix((weights, (rows, columns)), shape=shape),
                )

            @staticmethod
            def _feature_matrix(rows, entity_ids, feature_map):
                matrix = sparse.lil_matrix(
                    (len(entity_ids), len(feature_map)),
                    dtype=float,
                )
                entity_index = {
                    entity_id: index for index, entity_id in enumerate(entity_ids)
                }
                for entity_id, weights in rows:
                    row_index = entity_index[entity_id]
                    matrix[row_index, feature_map[entity_id]] = 1.0
                    for feature_name, weight in weights.items():
                        matrix[row_index, feature_map[feature_name]] = weight
                return matrix.tocsr()

            def build_user_features(self, rows, normalize=False):
                self.assert_normalize = normalize
                return self._feature_matrix(
                    list(rows),
                    self.users,
                    self.user_feature_map,
                )

            def build_item_features(self, rows, normalize=False):
                self.assert_normalize = normalize
                return self._feature_matrix(
                    list(rows),
                    self.items,
                    self.item_feature_map,
                )

        class FakeTrainModel:
            def fit(self, interactions, **kwargs):
                self.interactions = interactions
                self.fit_kwargs = kwargs
                return self

        fake_model = FakeTrainModel()
        ratings = pd.DataFrame(
            [{"user_id": "active", "recipe_id": "1", "rating": 5.0}]
        )
        recipes = [
            {
                "id": 1,
                "minutes": 20,
                "n_steps": 4,
                "n_ingredients": 2,
                "ingredients": ["rice", "ginger"],
                "nutrition": [250, 4, 2, 200, 8, 1, 40],
            },
            {
                "id": 2,
                "minutes": 35,
                "n_steps": 7,
                "n_ingredients": 2,
                "ingredients": ["tofu", "carrot"],
                "nutrition": [300, 7, 3, 250, 14, 2, 35],
            },
        ]

        with (
            patch.object(recommend_batch, "LightFMDataset", FakeDataset),
            patch.object(
                recommend_batch,
                "LightFM",
                lambda **_kwargs: fake_model,
            ),
        ):
            result = train_lightfm_preference_model(
                ratings,
                recipe_catalog=["1", "2"],
                active_users=["active"],
                recipes_data=recipes,
            )

        self.assertIsNotNone(result)
        self.assertIs(fake_model.fit_kwargs["user_features"], result.user_features)
        self.assertIs(fake_model.fit_kwargs["item_features"], result.item_features)
        self.assertGreater(result.user_features.shape[1], 1)
        self.assertGreater(result.item_features.shape[1], 2)


class CandidateReplacementTests(unittest.TestCase):
    def test_generation_name_is_unique_and_storage_safe(self):
        first = preference_model_generation_name(
            "lightfm_preference",
            "2026-07-23T10:00:00.123456+00:00",
        )
        second = preference_model_generation_name(
            "lightfm_preference",
            "2026-07-23T10:00:01.123456+00:00",
        )

        self.assertEqual(
            "lightfm_preference@20260723T1000001234560000",
            first,
        )
        self.assertNotEqual(first, second)

    def test_staged_artifact_does_not_change_live_file_until_promotion(self):
        with tempfile.TemporaryDirectory() as directory:
            live_path = Path(directory) / "artifact.npz"
            live_path.write_bytes(b"old-generation")
            staging_path = create_artifact_staging_path(live_path)
            staging_path.write_bytes(b"new-generation")

            self.assertEqual(b"old-generation", live_path.read_bytes())
            self.assertTrue(promote_staged_artifact(staging_path, live_path))
            self.assertEqual(b"new-generation", live_path.read_bytes())
            self.assertFalse(staging_path.exists())

    def test_candidate_generation_deletes_stale_rows_before_upsert(self):
        supabase = FakeCandidateSupabase()
        rows = [
            {
                "user_id": "u1",
                "recipe_id": 1,
                "preference_score": 0.9,
                "model_name": "lightfm_preference",
            }
        ]

        success = replace_candidate_rows(
            supabase,
            rows,
            active_users=["u1", "u2"],
            model_name="lightfm_preference",
        )

        self.assertTrue(success)
        delete_index = supabase.calls.index(("delete",))
        upsert_index = next(
            index
            for index, call in enumerate(supabase.calls)
            if call[0] == "upsert"
        )
        self.assertLess(delete_index, upsert_index)
        self.assertIn(("eq", "model_name", "lightfm_preference"), supabase.calls)
        self.assertIn(("in", "user_id", ["u1", "u2"]), supabase.calls)

    def test_empty_generation_still_removes_prior_candidates(self):
        supabase = FakeCandidateSupabase()

        success = replace_candidate_rows(
            supabase,
            [],
            active_users=["u1"],
            model_name="cf_item_factors",
        )

        self.assertTrue(success)
        self.assertIn(("delete",), supabase.calls)
        self.assertFalse(any(call[0] == "upsert" for call in supabase.calls))


class HomeExclusionTests(unittest.TestCase):
    def test_batch_exclusion_matches_online_saved_and_liked_policy(self):
        interactions = pd.DataFrame(
            [
                {"user_id": "u", "recipe_id": "1", "interaction_type": "viewed"},
                {"user_id": "u", "recipe_id": "2", "interaction_type": "liked"},
                {"user_id": "u", "recipe_id": "3", "interaction_type": "saved"},
                {"user_id": "u", "recipe_id": "4", "interaction_type": "dismissed"},
                {"user_id": "other", "recipe_id": "5", "interaction_type": "liked"},
            ]
        )

        self.assertEqual(
            {"2", "3"},
            home_excluded_recipe_ids(interactions, "u"),
        )


class LightFMArtifactTests(unittest.TestCase):
    def test_versioned_artifact_materializes_and_loads_user_item_representations(self):
        model = FakeLightFMModel()
        item_features = object()
        user_features = object()
        training = LightFMTrainingResult(
            model=model,
            user_id_map={"active": 1, "hist_1": 0},
            item_id_map={"1": 0, "2": 1, "3": 2},
            user_features=user_features,
            item_features=item_features,
        )

        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "artifact.npz"
            save_lightfm_item_artifact(
                training,
                recipe_catalog=["2", "1"],
                active_users=["active"],
                trained_at="2026-07-23T10:00:00+00:00",
                model_name="lightfm_preference",
                artifact_path=artifact_path,
            )
            loaded = load_cf_artifact(artifact_path)

        self.assertIs(model.item_features_seen, item_features)
        self.assertIs(model.user_features_seen, user_features)
        self.assertEqual(2, loaded["artifact_version"])
        self.assertEqual(["2", "1"], loaded["recipe_ids"].tolist())
        np.testing.assert_allclose(loaded["item_factors"], [[0.0, 2.0], [1.0, 0.0]])
        vector, bias = get_learned_user_state("active", loaded)
        np.testing.assert_allclose(vector, [0.0, 3.0])
        self.assertAlmostEqual(0.5, bias)

    def test_legacy_svd_artifact_remains_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "legacy.npz"
            np.savez_compressed(
                artifact_path,
                recipe_ids=np.array(["1", "2"], dtype=object),
                item_factors=np.array([[1.0, 0.0], [0.0, 1.0]]),
                item_biases=np.array([0.1, 0.2]),
                global_mean=np.array([3.0]),
                backend=np.array(["sklearn"], dtype=object),
            )
            loaded = load_cf_artifact(artifact_path)

        self.assertEqual(1, loaded["artifact_version"])
        self.assertIsNone(loaded["trained_at"])
        vector, bias = get_learned_user_state("missing", loaded)
        self.assertIsNone(vector)
        self.assertEqual(0.0, bias)

    def test_svd_fallback_is_promoted_to_generation_aware_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "svd.npz"
            np.savez_compressed(
                artifact_path,
                recipe_ids=np.array(["1", "2"], dtype=object),
                item_factors=np.array([[1.0, 0.0], [0.0, 1.0]]),
                item_biases=np.array([0.1, 0.2]),
                global_mean=np.array([3.0]),
                backend=np.array(["sklearn"], dtype=object),
            )
            postprocess_artifact_with_metadata(
                artifact_path,
                recipes_data=[],
                trained_at="2026-07-23T10:00:00Z",
                model_name="cf_item_factors",
            )
            loaded = load_cf_artifact(artifact_path)

        self.assertEqual(2, loaded["artifact_version"])
        self.assertEqual("2026-07-23T10:00:00Z", loaded["trained_at"])
        self.assertEqual("cf_item_factors", loaded["model_name"])
        self.assertEqual("sklearn", loaded["backend"])

    def test_artifact_metadata_preserves_missing_recipe_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "metadata.npz"
            np.savez_compressed(
                artifact_path,
                recipe_ids=np.array(["1"], dtype=object),
                item_factors=np.array([[1.0, 0.0]]),
                item_biases=np.array([0.1]),
                global_mean=np.array([3.0]),
                backend=np.array(["sklearn"], dtype=object),
            )
            postprocess_artifact_with_metadata(
                artifact_path,
                recipes_data=[
                    {
                        "id": 1,
                        "name": "Unknown metadata",
                        "minutes": None,
                        "n_steps": None,
                        "n_ingredients": None,
                        "ingredients": None,
                        "nutrition": None,
                    }
                ],
                trained_at="2026-07-23T10:00:00Z",
                model_name="cf_item_factors",
            )
            recommend_fast._RECIPES_META_CACHE["data"] = None
            recommend_fast._RECIPES_META_CACHE["loaded_at"] = None
            load_cf_artifact(artifact_path)
            recipe = recommend_fast._RECIPES_META_CACHE["data"]["1"]

        self.assertEqual([], recipe["ingredients"])
        self.assertNotIn("minutes", recipe)
        self.assertNotIn("n_steps", recipe)
        self.assertNotIn("n_ingredients", recipe)
        self.assertNotIn("nutrition", recipe)

    def test_malformed_lightfm_v2_learned_users_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "malformed.npz"
            np.savez_compressed(
                artifact_path,
                artifact_version=np.array([2]),
                recipe_ids=np.array(["1"], dtype=object),
                item_factors=np.array([[1.0, 0.0]]),
                item_biases=np.array([0.1]),
                global_mean=np.array([0.0]),
                backend=np.array(["lightfm"], dtype=object),
                trained_at=np.array(["2026-07-23T10:00:00Z"], dtype=object),
                model_name=np.array(["lightfm_preference"], dtype=object),
                learned_user_ids=np.array(["u"], dtype=object),
                learned_user_factors=np.array([[1.0, 0.0, 3.0]]),
                learned_user_biases=np.array([0.2]),
            )

            with self.assertRaisesRegex(ValueError, "learned-user factors"):
                load_cf_artifact(artifact_path)

    def test_invalid_download_does_not_replace_valid_cached_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "cached.npz"
            np.savez_compressed(
                artifact_path,
                recipe_ids=np.array(["1"], dtype=object),
                item_factors=np.array([[1.0, 0.0]]),
                item_biases=np.array([0.1]),
                global_mean=np.array([3.0]),
                backend=np.array(["sklearn"], dtype=object),
            )
            original_bytes = artifact_path.read_bytes()

            usable = download_artifact_from_storage(
                FakeStorageSupabase(b"not an npz archive"),
                artifact_path=artifact_path,
                force=True,
            )

            self.assertTrue(usable)
            self.assertEqual(original_bytes, artifact_path.read_bytes())
            self.assertEqual([], list(Path(directory).glob("*.download")))

    def test_batch_predictions_pass_feature_matrices(self):
        model = FakeLightFMModel()
        item_features = object()
        user_features = object()
        training = LightFMTrainingResult(
            model=model,
            user_id_map={"active": 0},
            item_id_map={"a": 2, "b": 0},
            user_features=user_features,
            item_features=item_features,
        )

        predictions = lightfm_predictions_for_user(
            training,
            "active",
            ["a", "b"],
        )

        self.assertEqual([("a", 2.0), ("b", 0.0)], predictions)
        self.assertIs(model.predict_kwargs["user_features"], user_features)
        self.assertIs(model.predict_kwargs["item_features"], item_features)


class LightFMOnlineBlendTests(unittest.TestCase):
    def test_interaction_history_is_paginated_past_supabase_row_cap(self):
        pages = {
            0: [
                {
                    "user_id": "u",
                    "recipe_id": "1",
                    "interaction_type": "viewed",
                    "created_at": "2026-07-23T09:00:00Z",
                },
                {
                    "user_id": "u",
                    "recipe_id": "2",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T10:00:00Z",
                },
            ],
            2: [
                {
                    "user_id": "u",
                    "recipe_id": "3",
                    "interaction_type": "saved",
                    "created_at": "2026-07-23T11:00:00Z",
                }
            ],
        }
        supabase = FakePagedInteractionSupabase(pages)

        with patch.dict(
            recommend_fast.os.environ,
            {"SUPABASE_FETCH_PAGE_SIZE": "2"},
        ):
            interactions = fetch_user_interactions(supabase, "u")

        self.assertEqual(["1", "2", "3"], interactions["recipe_id"].tolist())
        self.assertIn(("range", 0, 1), supabase.calls)
        self.assertIn(("range", 2, 3), supabase.calls)
        self.assertIn(("range", 3, 4), supabase.calls)

    def test_batch_and_online_boundaries_do_not_double_count(self):
        raw = pd.DataFrame(
            [
                {
                    "user_id": "u",
                    "recipe_id": "1",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T09:59:00Z",
                },
                {
                    "user_id": "u",
                    "recipe_id": "2",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T10:01:00Z",
                },
            ]
        )
        boundary = "2026-07-23T10:00:00+00:00"

        batch_rows = interactions_through_training_boundary(raw, boundary)
        online_rows = interactions_for_online_update(raw, {"trained_at": boundary})

        self.assertEqual(["1"], batch_rows["recipe_id"].tolist())
        self.assertEqual(["2"], online_rows["recipe_id"].tolist())

    def test_missing_learned_user_state_can_rebuild_from_full_history(self):
        raw = pd.DataFrame(
            [
                {
                    "user_id": "u",
                    "recipe_id": "1",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T09:59:00Z",
                },
                {
                    "user_id": "u",
                    "recipe_id": "2",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T10:01:00Z",
                },
            ]
        )

        selected = interactions_for_online_update(
            raw,
            {"trained_at": "2026-07-23T10:00:00Z"},
            use_full_history=True,
        )

        self.assertEqual(["1", "2"], selected["recipe_id"].tolist())

    def test_post_training_positive_vector_blends_with_learned_vector(self):
        raw = pd.DataFrame(
            [
                {
                    "user_id": "u",
                    "recipe_id": "1",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T09:00:00Z",
                },
                {
                    "user_id": "u",
                    "recipe_id": "2",
                    "interaction_type": "liked",
                    "created_at": "2026-07-23T11:00:00Z",
                },
                {
                    "user_id": "u",
                    "recipe_id": "3",
                    "interaction_type": "dismissed",
                    "created_at": "2026-07-23T11:05:00Z",
                },
            ]
        )
        artifact = {
            "trained_at": "2026-07-23T10:00:00Z",
            "recipe_index": {"1": 0, "2": 1, "3": 2},
            "item_factors": np.array(
                [[1.0, 0.0], [0.0, 2.0], [-1.0, 0.0]]
            ),
        }

        online_rows = interactions_for_online_update(raw, artifact)
        online_ratings = process_interactions_to_ratings(online_rows)
        online_vector = build_user_vector(online_ratings, artifact)
        blended = blend_user_vectors(
            np.array([2.0, 0.0]),
            online_vector,
            online_weight=0.25,
        )

        np.testing.assert_allclose(online_vector, [0.0, 2.0])
        np.testing.assert_allclose(blended, [1.5, 0.5])

    def test_online_blend_strength_scales_with_post_training_evidence(self):
        one_view = pd.DataFrame([{"rating": 1.5}])
        one_save = pd.DataFrame([{"rating": 5.0}])

        self.assertAlmostEqual(
            0.105,
            effective_online_vector_weight(
                one_view,
                maximum_weight=0.35,
                full_strength=5.0,
            ),
        )
        self.assertAlmostEqual(
            0.35,
            effective_online_vector_weight(
                one_save,
                maximum_weight=0.35,
                full_strength=5.0,
            ),
        )

    def test_cold_user_online_vector_obeys_evidence_weight_during_scoring(self):
        scaled_online = blend_user_vectors(
            learned_vector=None,
            online_vector=np.array([2.0, 4.0]),
            online_weight=0.1,
        )
        artifact = {
            "backend": "lightfm",
            "recipe_index": {"a": 0},
            "item_factors": np.array([[1.0, 0.0]]),
            "item_biases": np.array([0.0]),
            "global_mean": 0.0,
        }

        scores = reconstruct_artifact_scores(
            artifact,
            ["a"],
            lightfm_user_vector=scaled_online,
        )

        np.testing.assert_allclose(scaled_online, [0.2, 0.4])
        self.assertAlmostEqual(0.2, scores["a"])

    def test_artifact_scoring_only_returns_requested_recipe_rows(self):
        artifact = {
            "backend": "lightfm",
            "recipe_index": {"a": 0, "b": 1, "c": 2},
            "item_factors": np.array(
                [[1.0, 0.0], [0.0, 2.0], [5.0, 5.0]]
            ),
            "item_biases": np.array([0.0, 0.1, 9.0]),
            "global_mean": 0.0,
        }

        scores = reconstruct_artifact_scores(
            artifact,
            ["b", "missing"],
            lightfm_user_vector=np.array([1.0, 1.0]),
        )

        self.assertEqual({"b": 2.1}, scores)

    def test_flavor_scores_are_candidate_bounded_and_generation_keyed(self):
        recommend_fast._FLAVOR_CENTROID_CACHE.update(
            {
                "artifact_key": None,
                "centroid": None,
                "computed_at": None,
                "n_seeds": 0,
            }
        )
        base_artifact = {
            "artifact_version": 2,
            "backend": "lightfm",
            "trained_at": "2026-07-23T10:00:00Z",
            "model_name": "lightfm@generation-one",
            "recipe_ids": np.array(["a", "b"]),
            "recipe_index": {"a": 0, "b": 1},
            "item_factors": np.array([[1.0, 0.0], [0.0, 1.0]]),
            "flavor_centroid": np.array([1.0, 0.0]),
        }

        first_centroid, first_scores = get_flavor_artifact(
            {},
            base_artifact,
            ["a"],
        )
        next_artifact = {
            **base_artifact,
            "trained_at": "2026-07-23T11:00:00Z",
            "model_name": "lightfm@generation-two",
            "flavor_centroid": np.array([0.0, 1.0]),
        }
        next_centroid, next_scores = get_flavor_artifact(
            {},
            next_artifact,
            ["a"],
        )

        np.testing.assert_allclose(first_centroid, [1.0, 0.0])
        self.assertEqual({"a"}, set(first_scores))
        self.assertAlmostEqual(1.0, first_scores["a"])
        np.testing.assert_allclose(next_centroid, [0.0, 1.0])
        self.assertAlmostEqual(0.0, next_scores["a"])

    def test_precomputed_candidate_ids_are_rescored_and_resorted(self):
        rescored = rescore_precomputed_candidates(
            [("a", 99.0), ("b", 98.0), ("a", 97.0), ("missing", 96.0)],
            {"a": 0.1, "b": 0.9},
        )
        self.assertEqual([("b", 0.9), ("a", 0.1)], rescored)

    def test_svd_precomputed_scores_are_preserved_without_online_evidence(self):
        artifact = {
            "recipe_index": {"a": 0, "b": 1},
            "item_factors": np.array([[100.0, 0.0], [0.0, 1.0]]),
        }

        rescored = apply_bounded_online_delta(
            [("b", 5.0), ("a", 4.5)],
            artifact,
            online_vector=None,
            online_weight=0.0,
        )

        self.assertEqual([("b", 5.0), ("a", 4.5)], rescored)

    def test_svd_online_delta_is_capped_instead_of_replacing_batch_score(self):
        artifact = {
            "recipe_index": {"a": 0, "b": 1},
            "item_factors": np.array([[100.0, 0.0], [0.0, 1.0]]),
        }

        rescored = apply_bounded_online_delta(
            [("b", 5.0), ("a", 4.5)],
            artifact,
            online_vector=np.array([1.0, 0.0]),
            online_weight=0.35,
            delta_limit=1.0,
        )

        self.assertEqual([("a", 5.5), ("b", 5.0)], rescored)


if __name__ == "__main__":
    unittest.main()
