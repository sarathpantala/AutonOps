from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
from app.core.logging import logger
from app.routers import incidents_router, services_router, actions_router, analysis_router, clusters_router, k8s_router, auth_router, workspaces_router


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR"))
        await conn.execute(text("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS environment_type VARCHAR DEFAULT 'development'"))


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(incidents_router)
app.include_router(services_router)
app.include_router(actions_router)
app.include_router(analysis_router)
app.include_router(clusters_router)
app.include_router(k8s_router)
app.include_router(auth_router)
app.include_router(workspaces_router)


@app.on_event("startup")
async def startup_event():
    logger.info("Starting up the application...")
    await create_tables()
    logger.info("Database tables created.")


@app.get("/")
async def root():
    return {"message": "Welcome to AutonOps Backend - A junior SRE that never sleeps"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}