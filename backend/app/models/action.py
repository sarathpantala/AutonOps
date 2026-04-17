from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class ActionType(enum.Enum):
    MANUAL = "manual"
    AUTOMATED = "automated"
    RESTART_POD = "restart_pod"
    ROLLOUT_RESTART = "rollout_restart"
    SCALE_DEPLOYMENT = "scale_deployment"
    DELETE_POD = "delete_pod"
    CORDON_NODE = "cordon_node"
    DRAIN_NODE = "drain_node"
    PATCH_DEPLOYMENT = "patch_deployment"
    EXEC_COMMAND = "exec_command"


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)
    chat_session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=True)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=True)

    # What kind of action
    type = Column(Enum(ActionType), default=ActionType.MANUAL)
    description = Column(Text, nullable=False)

    # Approval workflow
    # status: pending_approval | approved | rejected | executing | completed | failed | dry_run
    status = Column(String, nullable=False, default="pending_approval")
    risk_level = Column(String, nullable=False, default="low")  # low|medium|high|critical
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_notes = Column(Text, nullable=True)

    # Kubernetes operation details
    command_payload = Column(JSON, nullable=True)  # {operation, namespace, name, params}
    is_dry_run = Column(Boolean, default=False)

    # Execution results
    execution_result = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    executed_at = Column(DateTime(timezone=True), server_default=func.now())

    incident = relationship("Incident", back_populates="actions")
    cluster = relationship("Cluster", foreign_keys=[cluster_id])