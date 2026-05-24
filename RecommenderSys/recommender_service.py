"""
HTTP service for online CF recommendation refreshes.

Deploy this Python service somewhere that supports numpy/pandas/scikit-surprise
dependencies, such as Render or Railway. The frontend API route calls it with a
server-side secret; it loads the saved CF artifact from Supabase Storage and
updates user_recommendations for the requested user.
"""

import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

from recommend_fast import recommend_for_user

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / ".env.local")


class RecommendationRequest(BaseModel):
    user_id: str
    k: int = 6


app = FastAPI(title="Tamar Recommender Service")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/recommend-user")
def recommend_user(
    payload: RecommendationRequest,
    x_recommender_secret: str | None = Header(default=None),
) -> dict:
    expected_secret = os.getenv("RECOMMENDER_SERVICE_SECRET")
    if expected_secret and x_recommender_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    recommendations = recommend_for_user(payload.user_id, k=payload.k, upload=True)
    return {
        "ok": True,
        "recommended_recipe_ids": [recipe_id for recipe_id, _ in recommendations],
    }
