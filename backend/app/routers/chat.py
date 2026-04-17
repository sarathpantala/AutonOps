"""
Chat router — the primary SRE AI interface.

POST /chat/query          — send a query, get AI analysis + suggested actions
POST /chat/stream         — same but streams JSON via SSE as chunks arrive
GET  /chat/sessions       — list sessions for a workspace
GET  /chat/sessions/{id}  — get session metadata
GET  /chat/sessions/{id}/messages — full conversation history
DELETE /chat/sessions/{id} — remove a session
"""
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas.chat import (
    ChatQueryRequest,
    ChatQueryResponse,
    ChatSessionResponse,
    ChatMessageResponse,
)
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/query", response_model=ChatQueryResponse)
async def sre_chat_query(
    request: ChatQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Main SRE chat endpoint.

    Accepts a user query and optional cluster_id.
    Builds live cluster context → queries AI → returns structured analysis
    with suggested actions saved in pending_approval state.
    """
    service = ChatService(db)
    try:
        result = await service.handle_query(
            query=request.query,
            workspace_id=request.workspace_id,
            cluster_id=request.cluster_id,
            session_id=request.session_id,
            provider=request.provider,
            namespace=request.namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat query failed: {exc}")

    return ChatQueryResponse(**result)


@router.post("/stream")
async def sre_chat_stream(
    request: ChatQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Streaming version of /chat/query.
    Sends Server-Sent Events:
      data: {"type": "status", "text": "Collecting cluster context..."}
      data: {"type": "status", "text": "Querying AI..."}
      data: {"type": "result", ...full ChatQueryResponse payload...}
      data: {"type": "error", "detail": "..."}
    """
    service = ChatService(db)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'status', 'text': 'Collecting cluster context...'})}\n\n"
            await asyncio.sleep(0)  # flush

            yield f"data: {json.dumps({'type': 'status', 'text': 'Analyzing with AI...'})}\n\n"
            await asyncio.sleep(0)

            result = await service.handle_query(
                query=request.query,
                workspace_id=request.workspace_id,
                cluster_id=request.cluster_id,
                session_id=request.session_id,
                provider=request.provider,
                namespace=request.namespace,
            )

            yield f"data: {json.dumps({'type': 'result', **result})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    workspace_id: int = Query(...),
    cluster_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all chat sessions for a workspace."""
    service = ChatService(db)
    return await service.list_sessions(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        limit=limit,
    )


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    session = await service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageResponse])
async def get_session_messages(
    session_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Full conversation history for a session."""
    service = ChatService(db)
    session = await service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await service.get_messages(session_id=session_id, limit=limit)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    deleted = await service.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
