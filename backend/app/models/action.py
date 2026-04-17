from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class ActionType(enum.Enum):
    MANUAL = "manual"
    AUTOMATED = "automated"


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"))
    type = Column(Enum(ActionType), default=ActionType.MANUAL)
    description = Column(Text, nullable=False)
    executed_at = Column(DateTime(timezone=True), server_default=func.now())

    incident = relationship("Incident", back_populates="actions")