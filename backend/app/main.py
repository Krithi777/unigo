import json
import logging
import os
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, community, rides, pulse, emergency, payments, dashboard, driver, users
from app.routers.driver import admin_router

app = FastAPI(title="UniGo API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,       prefix="/auth",       tags=["auth"])
app.include_router(community.router,  prefix="/community",  tags=["community"])
app.include_router(driver.router,     prefix="/driver",     tags=["driver"])
app.include_router(admin_router,      prefix="/admin",      tags=["admin"])
#app.include_router(rides.router,     prefix="/rides",      tags=["rides"])
#app.include_router(pulse.router,     prefix="/pulse",      tags=["pulse"])
#app.include_router(emergency.router, prefix="/emergency",  tags=["emergency"])
#app.include_router(payments.router,  prefix="/payments",   tags=["payments"])
#app.include_router(dashboard.router, prefix="/dashboard",  tags=["dashboard"])
#app.include_router(users.router,     prefix="/users",      tags=["users"])
from app.routers import rides, women_ride  # noqa: E402
# --------------------------------------------------------------------------- #
#  Firebase Admin SDK — initialise once at startup
# --------------------------------------------------------------------------- #

# --------------------------------------------------------------------------- #
#  FastAPI app
# --------------------------------------------------------------------------- #


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

@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy"}
@app.get("/health")
def health():
    return {"status": "ok"}