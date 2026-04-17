from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    cluster_type = Column(String, nullable=False)  # eks|gke|openshift|kind|other
    status = Column(String, nullable=False, default="connected")
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Stored credentials (used by context builder & action engine)
    auth_method = Column(String, nullable=True)         # kubeconfig|service-account
    kubeconfig_content = Column(Text, nullable=True)    # raw kubeconfig YAML
    credentials_json = Column(JSON, nullable=True)      # service-account / bearer token creds
    api_server_url = Column(String, nullable=True)      # override API server URL if needed

    workspace = relationship("Workspace", back_populates="clusters")