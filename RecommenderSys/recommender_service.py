"""
HTTP service for online hybrid preference and health-risk refreshes.

Deploy this Python service somewhere that supports the recommender service
dependencies, such as Render or Railway. The frontend API route calls it with a
server-side secret; it validates cached preference/symptom artifacts from
Supabase Storage and updates user_recommendations for the requested user.
"""

import os
import threading
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel, constr
from dotenv import load_dotenv

from health_events import (
    add_user_restriction,
    log_meal,
    report_health,
    sync_ibs_population_priors,
    sync_recipe_ingredients_from_recipes,
)
from recommend_fast import recommend_for_user
from recommender_common import load_supabase_client

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / ".env.local")


class RecommendationRequest(BaseModel):
    user_id: str
    k: int = 6


class MealLogRequest(BaseModel):
    user_id: str
    food_name: str
    recipe_id: str | int | None = None
    logged_at: str | None = None
    portion_size: float | None = None
    portion_unit: str | None = None
    image_url: str | None = None
    notes: str | None = None
    calories: float | None = None
    protein_g: float | None = None
    fat_g: float | None = None
    nutrition_source: str | None = None
    nutrition_confidence: float | None = None


class HealthReportRequest(BaseModel):
    user_id: str
    symptom_type: str = "digestive_discomfort"
    severity: float
    reported_at: str | None = None
    notes: str | None = None
    no_symptoms: bool = False


NonBlankRestrictionName = constr(strip_whitespace=True, min_length=1)


class RestrictionRequest(BaseModel):
    user_id: str
    ingredient_name: NonBlankRestrictionName
    restriction_type: Literal[
        "allergy",
        "strict_sensitivity",
        "forbidden_ingredient",
        "diet_violation",
    ]
    severity: Literal["low", "medium", "high", "strict"] = "strict"
    is_strict: bool = True
    notes: str | None = None


class SyncCatalogRequest(BaseModel):
    recipe_limit: int | None = None
    sync_population_priors: bool = True


app = FastAPI(title="Tamar Recommender Service")
_recommendation_users_in_progress: set[str] = set()
_recommendation_users_lock = threading.Lock()


def require_service_secret(x_recommender_secret: str | None) -> None:
    expected_secret = os.getenv("RECOMMENDER_SERVICE_SECRET")
    if expected_secret and x_recommender_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


def run_recommendation_refresh(user_id: str, k: int) -> None:
    try:
        recommend_for_user(user_id, k=k, upload=True)
    except Exception as exc:
        print(f"[Error] Background recommendation refresh failed: {exc}")
    finally:
        with _recommendation_users_lock:
            _recommendation_users_in_progress.discard(user_id)


@app.post("/recommend-user", status_code=202)
def recommend_user(
    payload: RecommendationRequest,
    background_tasks: BackgroundTasks,
    x_recommender_secret: str | None = Header(default=None),
) -> dict:
    require_service_secret(x_recommender_secret)

    with _recommendation_users_lock:
        already_in_progress = payload.user_id in _recommendation_users_in_progress
        if not already_in_progress:
            _recommendation_users_in_progress.add(payload.user_id)

    if not already_in_progress:
        background_tasks.add_task(
            run_recommendation_refresh,
            payload.user_id,
            payload.k,
        )

    return {
        "ok": True,
        "accepted": True,
        "already_in_progress": already_in_progress,
    }


@app.post("/meal-log")
def create_meal_log(
    payload: MealLogRequest,
    x_recommender_secret: str | None = Header(default=None),
) -> dict:
    require_service_secret(x_recommender_secret)
    supabase = load_supabase_client()
    result = log_meal(
        supabase=supabase,
        user_id=payload.user_id,
        food_name=payload.food_name,
        recipe_id=payload.recipe_id,
        logged_at=payload.logged_at,
        portion_size=payload.portion_size,
        portion_unit=payload.portion_unit,
        image_url=payload.image_url,
        notes=payload.notes,
        calories=payload.calories,
        protein_g=payload.protein_g,
        fat_g=payload.fat_g,
        nutrition_source=payload.nutrition_source,
        nutrition_confidence=payload.nutrition_confidence,
    )
    return {"ok": True, **result}


@app.post("/health-report")
def create_health_report(
    payload: HealthReportRequest,
    x_recommender_secret: str | None = Header(default=None),
) -> dict:
    require_service_secret(x_recommender_secret)
    supabase = load_supabase_client()
    result = report_health(
        supabase=supabase,
        user_id=payload.user_id,
        symptom_type=payload.symptom_type,
        severity=payload.severity,
        reported_at=payload.reported_at,
        notes=payload.notes,
        no_symptoms=payload.no_symptoms,
    )
    return {"ok": True, **result}


@app.post("/restriction")
def create_restriction(
    payload: RestrictionRequest,
    x_recommender_secret: str | None = Header(default=None),
) -> dict:
    require_service_secret(x_recommender_secret)
    supabase = load_supabase_client()
    result = add_user_restriction(
        supabase=supabase,
        user_id=payload.user_id,
        ingredient_name=payload.ingredient_name,
        restriction_type=payload.restriction_type,
        severity=payload.severity,
        is_strict=payload.is_strict,
        notes=payload.notes,
    )
    return {"ok": True, "restriction": result}


@app.post("/sync-catalog")
def sync_catalog(
    payload: SyncCatalogRequest,
    x_recommender_secret: str | None = Header(default=None),
) -> dict:
    require_service_secret(x_recommender_secret)
    supabase = load_supabase_client()
    recipe_result = sync_recipe_ingredients_from_recipes(supabase, limit=payload.recipe_limit)
    prior_result = (
        sync_ibs_population_priors(supabase)
        if payload.sync_population_priors
        else {"prior_count": 0}
    )
    return {"ok": True, **recipe_result, **prior_result}
