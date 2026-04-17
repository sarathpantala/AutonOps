from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
from app.core.logging import logger
from app.routers import (
    incidents_router, services_router, actions_router, analysis_router,
    clusters_router, k8s_router, auth_router, workspaces_router, chat_router,
)


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Legacy column additions (kept for backward compat)
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR"
        ))
        await conn.execute(text(
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS environment_type VARCHAR DEFAULT 'development'"
        ))

        # Cluster credential storage (added for multi-cluster support)
        await conn.execute(text(
            "ALTER TABLE clusters ADD COLUMN IF NOT EXISTS auth_method VARCHAR"
        ))
        await conn.execute(text(
            "ALTER TABLE clusters ADD COLUMN IF NOT EXISTS kubeconfig_content TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE clusters ADD COLUMN IF NOT EXISTS credentials_json JSONB"
        ))
        await conn.execute(text(
            "ALTER TABLE clusters ADD COLUMN IF NOT EXISTS api_server_url VARCHAR"
        ))

        # Action engine columns
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending_approval'"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS risk_level VARCHAR NOT NULL DEFAULT 'low'"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS command_payload JSONB"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS cluster_id INTEGER REFERENCES clusters(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS chat_session_id INTEGER REFERENCES chat_sessions(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS execution_result TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS error_message TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS is_dry_run BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ADD COLUMN IF NOT EXISTS rejection_notes TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE actions ALTER COLUMN incident_id DROP NOT NULL"
        ))


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    version="2.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(incidents_router)
app.include_router(services_router)
app.include_router(actions_router)
app.include_router(analysis_router)
app.include_router(clusters_router)
app.include_router(k8s_router)
app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(chat_router)


@app.on_event("startup")
async def startup_event():
    logger.info("Starting AutonOps backend v2 — AI-powered SRE platform")
    await create_tables()
    logger.info("Database schema up to date.")


@app.get("/")
async def root():
    return {
        "message": "AutonOps — AI-powered SRE copilot",
        "version": "2.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}