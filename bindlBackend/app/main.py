from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.database import engine, Base
from app.routes import contracts, users, ai, disputes, amendments, health, withdrawals
from app.services.ghost_protection import start_scheduler
from app.middleware import RateLimitMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    scheduler = start_scheduler()
    yield
    scheduler.shutdown()


app = FastAPI(
    title="TrustLink API",
    description="Trust infrastructure for peer-to-peer transactions",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001", 
        "http://127.0.0.1:3000",
        settings.FRONTEND_URL if settings.FRONTEND_URL else "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router,     tags=["health"])
app.include_router(users.router,      prefix="/users",      tags=["users"])
app.include_router(contracts.router,  prefix="/contracts",  tags=["contracts"])
app.include_router(disputes.router,   prefix="/disputes",   tags=["disputes"])
app.include_router(amendments.router, prefix="/amendments", tags=["amendments"])
app.include_router(ai.router,         prefix="/ai",         tags=["ai"])
app.include_router(withdrawals.router, prefix="/withdrawals", tags=["withdrawals"])
