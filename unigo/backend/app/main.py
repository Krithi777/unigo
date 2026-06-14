# FastAPI app entrypoint
# - Initializes app, includes routers, mounts Socket.io ASGI app
#
# from fastapi import FastAPI
# from app.routers import auth, community, rides, pulse, emergency, payments, dashboard, driver, users
# from app.sockets.socket_manager import socket_app
#
# app = FastAPI(title="UniGo API")
#
# app.include_router(auth.router, prefix="/auth", tags=["auth"])
# app.include_router(community.router, prefix="/community", tags=["community"])
# app.include_router(rides.router, prefix="/rides", tags=["rides"])
# app.include_router(pulse.router, prefix="/pulse", tags=["pulse"])
# app.include_router(emergency.router, prefix="/emergency", tags=["emergency"])
# app.include_router(payments.router, prefix="/payments", tags=["payments"])
# app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
# app.include_router(driver.router, prefix="/driver", tags=["driver"])
# app.include_router(users.router, prefix="/users", tags=["users"])
#
# app.mount("/socket.io", socket_app)
