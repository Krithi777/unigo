"""
main.py — UniGo FastAPI application entry point.

Mounts:
  - All feature routers (Sahana / Krithika / Ruvanthika)
  - Socket.io ASGI app at /socket.io
  - Firebase Admin SDK initialisation for FCM push

Run:
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

import json
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --------------------------------------------------------------------------- #
#  Firebase Admin SDK — initialise once at startup
# --------------------------------------------------------------------------- #
try:
    import firebase_admin
    from firebase_admin import credentials

    _creds_env = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if _creds_env and not firebase_admin._apps:
        try:
            cred_dict = json.loads(_creds_env)
            cred = credentials.Certificate(cred_dict)
        except (json.JSONDecodeError, ValueError):
            # Treat the env var as a file path
            cred = credentials.Certificate(_creds_env)
        firebase_admin.initialize_app(cred)
        logging.getLogger(__name__).info("Firebase Admin SDK initialised.")
    elif not _creds_env:
        logging.getLogger(__name__).warning(
            "FIREBASE_CREDENTIALS_JSON not set — FCM push notifications disabled."
        )
except ImportError:
    logging.getLogger(__name__).warning("firebase_admin not installed.")

# --------------------------------------------------------------------------- #
#  FastAPI app
# --------------------------------------------------------------------------- #

app = FastAPI(
    title="UniGo API",
    description="Community-Powered Carpooling — Team Nightingale",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- #
#  Routers
# --------------------------------------------------------------------------- #

# Sahana's scope
from app.routers import rides, women_ride  # noqa: E402

app.include_router(rides.router, prefix="/rides", tags=["rides"])
app.include_router(women_ride.router, prefix="/rides", tags=["rides"])

# --------------------------------------------------------------------------- #
#  Socket.io ASGI mount
# --------------------------------------------------------------------------- #

from app.sockets.socket_manager import socket_app  # noqa: E402

app.mount("/socket.io", socket_app)

# --------------------------------------------------------------------------- #
#  Health check
# --------------------------------------------------------------------------- #

@app.get("/", tags=["health"])
async def root():
    return {"status": "ok", "service": "UniGo API"}


@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy"}