from .incidents import router as incidents_router
from .services import router as services_router
from .actions import router as actions_router
from .analysis import router as analysis_router
from .clusters import router as clusters_router
from .k8s import router as k8s_router
from .auth import router as auth_router
from .workspaces import router as workspaces_router

__all__ = ["incidents_router", "services_router", "actions_router", "analysis_router", "clusters_router", "k8s_router", "auth_router", "workspaces_router"]