"""
ChatService — manages chat sessions and messages in the database.
Orchestrates the full SRE chat flow:
  1. Build cluster context (ClusterContextService)
  2. Query AI (AIOrchestrationService)
  3. Persist suggested actions (ActionEngineService)
  4. Save conversation history
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.chat import ChatMessage, ChatSession
from app.models.action import Action


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    async def create_session(
        self,
        workspace_id: int,
        cluster_id: Optional[int] = None,
        user_id: Optional[int] = None,
        title: str = "New Chat",
    ) -> ChatSession:
        session = ChatSession(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            user_id=user_id,
            title=title,
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get_session(self, session_id: int) -> Optional[ChatSession]:
        result = await self.db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        workspace_id: int,
        cluster_id: Optional[int] = None,
        limit: int = 50,
    ) -> List[ChatSession]:
        query = (
            select(ChatSession)
            .where(ChatSession.workspace_id == workspace_id)
            .order_by(ChatSession.created_at.desc())
            .limit(limit)
        )
        if cluster_id is not None:
            query = query.where(ChatSession.cluster_id == cluster_id)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def delete_session(self, session_id: int) -> bool:
        session = await self.get_session(session_id)
        if not session:
            return False
        await self.db.delete(session)
        await self.db.commit()
        return True

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    async def add_message(
        self,
        session_id: int,
        role: str,
        content: str,
        meta: Optional[Dict[str, Any]] = None,
    ) -> ChatMessage:
        msg = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            meta=meta,
        )
        self.db.add(msg)
        await self.db.commit()
        await self.db.refresh(msg)
        return msg

    async def get_messages(
        self, session_id: int, limit: int = 100
    ) -> List[ChatMessage]:
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
            .limit(limit)
        )
        return result.scalars().all()

    # ------------------------------------------------------------------
    # Full SRE chat orchestration
    # ------------------------------------------------------------------

    _EXECUTE_INTENT_RE = re.compile(
        r"\b(do\s+that|execute|apply|run\s+it|fix\s+(it|this|that|those|them|the\s+\w+\s+pod)|yes|go\s+ahead|proceed|approve|restart\s+(the\s+)?pod|do\s+it)\b",
        re.IGNORECASE,
    )

    def _is_execute_intent(self, query: str) -> bool:
        return bool(self._EXECUTE_INTENT_RE.search(query.strip()))

    async def _get_pending_session_actions(self, session_id: int) -> List[Action]:
        result = await self.db.execute(
            select(Action)
            .where(Action.chat_session_id == session_id)
            .where(Action.status == "pending_approval")
        )
        return list(result.scalars().all())

    async def handle_query(
        self,
        query: str,
        workspace_id: int,
        cluster_id: Optional[int],
        session_id: Optional[int] = None,
        provider: Optional[str] = None,
        namespace: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        End-to-end SRE chat handler:
          1. Resolve or create session
          2. Build cluster context (if cluster_id provided)
          3. Call AI orchestration
          4. Persist suggested actions in pending_approval state
          5. Save conversation turns
          6. Return structured response
        """
        from app.services.context_service import ClusterContextService
        from app.services.ai_orchestration_service import AIOrchestrationService
        from app.services.action_engine_service import ActionEngineService

        # 1. Session
        if session_id:
            session = await self.get_session(session_id)
            if not session:
                raise ValueError(f"Chat session {session_id} not found.")
        else:
            title = query[:60] + "…" if len(query) > 60 else query
            session = await self.create_session(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                title=title,
            )

        # 1b. Execution-intent short-circuit: "do that", "fix it", "yes", etc.
        if session_id and self._is_execute_intent(query):
            pending = await self._get_pending_session_actions(session_id)
            if pending:
                engine = ActionEngineService(self.db)
                executed: List[str] = []
                failed: List[str] = []
                action_ids: List[int] = []
                for action in pending:
                    try:
                        await engine.approve_action(action_id=action.id)
                        await engine.execute_action(action_id=action.id)
                        executed.append(action.description[:80])
                        action_ids.append(action.id)
                    except Exception as exc:
                        failed.append(f"{action.description[:60]}: {exc}")

                await self.add_message(session_id=session.id, role="user", content=query)
                summary = (
                    f"Executed {len(executed)} action(s):\n"
                    + "\n".join(f"  ✓ {d}" for d in executed)
                    + (f"\n\nFailed:\n" + "\n".join(f"  ✗ {d}" for d in failed) if failed else "")
                )
                await self.add_message(session_id=session.id, role="assistant", content=summary)
                return {
                    "session_id": session.id,
                    "issue": f"Executed {len(executed)} pending action(s) from this session.",
                    "root_cause": "User requested execution of previously suggested actions.",
                    "confidence": 1.0,
                    "cluster_context_summary": summary,
                    "suggested_actions": [],
                    "action_ids": action_ids,
                }

        # 2. Cluster context
        context: Dict[str, Any] = {}
        if cluster_id:
            try:
                ctx_service = ClusterContextService()
                context = await ctx_service.build_context(
                    cluster_id=cluster_id,
                    db=self.db,
                    namespace=namespace,
                )
            except Exception as exc:
                logger.warning(f"Could not build cluster context for {cluster_id}: {exc}")
                context = {
                    "cluster_id": cluster_id,
                    "summary": f"Context unavailable: {exc}",
                    "pods": [],
                    "deployments": [],
                    "warning_events": [],
                    "unhealthy_pods": [],
                    "crash_looping_pods": [],
                }
        else:
            context = {
                "summary": "No cluster connected — answering based on query only.",
                "pods": [],
                "deployments": [],
                "warning_events": [],
                "unhealthy_pods": [],
                "crash_looping_pods": [],
            }

        # 3. Save user message
        await self.add_message(session_id=session.id, role="user", content=query)

        # 4. AI query
        ai_service = AIOrchestrationService()
        ai_response = await ai_service.sre_chat(
            query=query, context=context, provider=provider
        )

        # 5. Persist suggested_actions (derived from recommended_actions for action engine compat)
        action_engine = ActionEngineService(self.db)
        action_ids: List[int] = []

        # Map recommended_actions → suggested_actions for persistence
        recommended = ai_response.get("recommended_actions", [])
        suggested = ai_response.get("suggested_actions", [])

        # Merge: attach action_ids from DB persistence back into recommended_actions
        for i, suggestion in enumerate(suggested):
            try:
                action = await action_engine.create_suggested_action(
                    description=suggestion.get("description", suggestion.get("action", "AI-suggested action")),
                    action_type=suggestion.get("type", "manual"),
                    risk_level=suggestion.get("risk_level", suggestion.get("risk", "medium")),
                    command_payload=suggestion.get("command_payload", {}),
                    cluster_id=cluster_id,
                    chat_session_id=session.id,
                )
                action_ids.append(action.id)
                suggestion["action_id"] = action.id
                # Also set action_id on the parallel recommended_action if present
                if i < len(recommended):
                    recommended[i]["action_id"] = action.id
            except Exception as exc:
                logger.warning(f"Could not persist suggested action: {exc}")

        # 6. Save assistant message
        await self.add_message(
            session_id=session.id,
            role="assistant",
            content=ai_response.get("summary", ai_response.get("issue", "Analysis complete")),
            meta={**ai_response, "action_ids": action_ids},
        )

        return {
            "session_id": session.id,
            # New schema
            "summary": ai_response.get("summary", ""),
            "issues": ai_response.get("issues", []),
            "recommended_actions": recommended,
            "confidence": ai_response.get("confidence", 0.5),
            # Legacy compat
            "issue": ai_response.get("issue", ""),
            "root_cause": ai_response.get("root_cause", ""),
            "cluster_context_summary": ai_response.get("cluster_context_summary", ""),
            "suggested_actions": suggested,
            "action_ids": action_ids,
        }
