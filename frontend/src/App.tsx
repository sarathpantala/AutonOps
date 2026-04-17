import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { CircleDashed, Filter, RefreshCw, Search } from 'lucide-react';
import ClusterOnboardingWizard from './components/ClusterOnboardingWizard';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import OAuthCallback from './components/OAuthCallback';
import Sidebar from './components/Sidebar';

const API_BASE_URL = 'http://localhost:8000';

type Section = 'Overview' | 'Incidents' | 'Clusters' | 'Workspace' | 'Add Cluster' | 'Chat';
type ThemeMode = 'light' | 'auto' | 'dark';

const sectionMeta: Record<Section, { title: string; subtitle: string; searchPlaceholder: string }> = {
  Overview: {
    title: 'Overview',
    subtitle: 'Focus on unresolved incidents first, then stabilize service health.',
    searchPlaceholder: 'Search services or incidents',
  },
  Incidents: {
    title: 'Incidents',
    subtitle: 'Review active alerts, root-cause context, and remediation confidence.',
    searchPlaceholder: 'Search incidents',
  },
  Clusters: {
    title: 'Clusters',
    subtitle: 'Monitor connected clusters, health state, and active targets.',
    searchPlaceholder: 'Search clusters',
  },
  Workspace: {
    title: 'Workspace',
    subtitle: 'Review environment scope, workspace inventory, and rollout readiness.',
    searchPlaceholder: 'Search workspaces',
  },
  'Add Cluster': {
    title: 'Add Cluster',
    subtitle: 'Connect infrastructure and validate access before enabling automation.',
    searchPlaceholder: 'Search onboarding inputs',
  },
  Chat: {
    title: 'Chat',
    subtitle: 'Ask the AI operator for summaries, fixes, and safe rollout guidance.',
    searchPlaceholder: 'Search prompts',
  },
};

type ApiService = {
  id: number;
  name: string;
  is_active: boolean;
};

type ApiIncident = {
  id: number;
  title: string;
  status: 'open' | 'resolved' | 'acknowledged';
  service_id: number;
  created_at: string;
};

type ApiAction = {
  id: number;
  incident_id: number;
  description: string;
  executed_at: string;
  type: 'manual' | 'automated';
};

type WorkspaceRecord = {
  id: number;
  name: string;
  description?: string;
  environment_type: string;
};

type ClusterRecord = {
  id: number;
  name: string;
  cluster_type: string;
  status: string;
  workspace_id: number;
  created_at: string;
};

function getStoredAccessToken() {
  const storedToken = localStorage.getItem('access_token');
  if (storedToken) {
    return storedToken;
  }

  const cookieMatch = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
  return cookieMatch?.[1] ?? '';
}

function getAuthenticatedHeaders() {
  const accessToken = getStoredAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function normalizeWorkspace(workspace: Partial<WorkspaceRecord>) {
  return {
    id: Number(workspace.id),
    name: workspace.name ?? 'Workspace',
    description: workspace.description,
    environment_type: workspace.environment_type ?? 'development',
  } satisfies WorkspaceRecord;
}

function formatRelativeTime(dateString: string) {
  const delta = Date.now() - new Date(dateString).getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function usePlatformData() {
  const [services, setServices] = useState<ApiService[]>([]);
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [actions, setActions] = useState<ApiAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');

      try {
        const [servicesResponse, incidentsResponse, actionsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/services/`),
          fetch(`${API_BASE_URL}/incidents/`),
          fetch(`${API_BASE_URL}/actions/`),
        ]);

        if (!servicesResponse.ok || !incidentsResponse.ok || !actionsResponse.ok) {
          throw new Error('Failed to load platform data');
        }

        const [servicesData, incidentsData, actionsData] = await Promise.all([
          servicesResponse.json() as Promise<ApiService[]>,
          incidentsResponse.json() as Promise<ApiIncident[]>,
          actionsResponse.json() as Promise<ApiAction[]>,
        ]);

        setServices(servicesData);
        setIncidents(incidentsData);
        setActions(actionsData);
      } catch {
        setError('Could not load platform data.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  return { services, incidents, actions, loading, error };
}

function incidentSeverity(incident: ApiIncident) {
  if (incident.status === 'resolved') {
    return 'low';
  }

  const title = incident.title.toLowerCase();
  if (title.includes('critical') || title.includes('down') || title.includes('outage')) {
    return 'critical';
  }
  if (incident.status === 'acknowledged') {
    return 'high';
  }
  return 'medium';
}

function incidentRootCause(incident: ApiIncident) {
  const title = incident.title.toLowerCase();
  if (title.includes('memory')) {
    return 'Memory leak introduced during latest release causing pod eviction and repeated restarts.';
  }
  if (title.includes('latency') || title.includes('timeout')) {
    return 'Dependency latency spike is saturating worker pools and degrading request handling.';
  }
  if (title.includes('cpu')) {
    return 'CPU saturation under peak traffic due to under-provisioned deployment replicas.';
  }
  return 'Configuration drift between deployment and runtime policy triggered service instability.';
}

function confidenceForIncident(incidentId: number) {
  return 78 + (incidentId % 18);
}

function serviceCpu(serviceId: number) {
  return `${42 + (serviceId * 13) % 38}%`;
}

function serviceMemory(serviceId: number) {
  return `${49 + (serviceId * 11) % 34}%`;
}

function CreateWorkspaceModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, environmentType: string) => Promise<void>;
}) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [environmentType, setEnvironmentType] = useState('development');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setWorkspaceName('');
      setEnvironmentType('development');
      setSubmitting(false);
      setError('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceName.trim()) {
      setError('Workspace name is required.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onCreate(workspaceName.trim(), environmentType);
      onClose();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Failed to create workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/30 px-4 backdrop-blur-sm">
      <div className="ui-card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Create workspace</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Choose a workspace and environment to continue.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            type="text"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            className="ui-input w-full"
          />
          <select
            value={environmentType}
            onChange={(event) => setEnvironmentType(event.target.value)}
            className="ui-input w-full"
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>

          {error ? <div className="text-sm text-rose-500">{error}</div> : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="ui-ghost-btn">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="ui-primary-btn disabled:opacity-60">
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkspaceEmptyState({ onCreateWorkspace }: { onCreateWorkspace: () => void }) {
  return (
    <div className="ui-card mx-auto max-w-2xl px-8 py-14 text-center">
      <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Create your first workspace</h1>
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
        Start by creating a workspace. Then connect a cluster and take action on live incidents.
      </p>
      <button type="button" onClick={onCreateWorkspace} className="ui-primary-btn mt-6">
        Create workspace
      </button>
    </div>
  );
}

function OverviewPage({
  services,
  incidents,
  loading,
  error,
  onFix,
}: {
  services: ApiService[];
  incidents: ApiIncident[];
  loading: boolean;
  error: string;
  onFix: (incidentId: number) => void;
}) {
  const openIncidents = incidents.filter((incident) => incident.status !== 'resolved').slice(0, 6);
  const serviceNameById = useMemo(() => {
    const map = new Map<number, string>();
    services.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [services]);

  return (
    <div className="space-y-6">
      {error ? <div className="text-sm text-rose-300">{error}</div> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Active Incidents</h2>
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Next step: Fix highest severity</span>
        </div>

        <div className="ui-card overflow-hidden">
          {loading ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">Loading incidents...</div>
          ) : openIncidents.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">No active incidents. Next: review service health below.</div>
          ) : (
            openIncidents.map((incident) => {
              const severity = incidentSeverity(incident);
              return (
                <div key={incident.id} className="ui-table-row flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{serviceNameById.get(incident.service_id) ?? `Service #${incident.service_id}`}</p>
                    <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">{incident.title}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold uppercase ${severity === 'critical'
                      ? 'bg-rose-50 text-rose-600'
                      : severity === 'high'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-sky-50 text-sky-600'}`}>
                      {severity}
                    </span>
                    <button type="button" onClick={() => onFix(incident.id)} className="ui-primary-btn h-8 px-3 text-xs">
                      Fix
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Services</h2>
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Next step: stabilize unhealthy services</span>
        </div>

        <div className="ui-card overflow-x-auto">
          <table className="ui-table min-w-[640px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>
                    <div className="ui-table-empty">
                      <CircleDashed size={18} className="ui-table-empty-icon" />
                      <span>Loading services...</span>
                    </div>
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="ui-table-empty">
                      <CircleDashed size={18} className="ui-table-empty-icon" />
                      <span>No services available yet.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                services.map((service, index) => (
                  <tr key={service.id} className={`ui-table-row ${index < services.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                    <td className="text-[var(--color-text-primary)]">{service.name}</td>
                    <td>
                      <span className={`text-xs font-medium ${service.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {service.is_active ? 'Healthy' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-[var(--color-text-secondary)]">{serviceCpu(service.id)}</td>
                    <td className="text-[var(--color-text-secondary)]">{serviceMemory(service.id)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function IncidentsPage({
  incidents,
  services,
  selectedIncidentId,
  onSelectIncident,
}: {
  incidents: ApiIncident[];
  services: ApiService[];
  selectedIncidentId: number | null;
  onSelectIncident: (incidentId: number) => void;
}) {
  const openIncidents = incidents.filter((incident) => incident.status !== 'resolved');
  const selectedIncident = openIncidents.find((incident) => incident.id === selectedIncidentId) ?? openIncidents[0] ?? null;
  const serviceName = selectedIncident
    ? services.find((service) => service.id === selectedIncident.service_id)?.name ?? `Service #${selectedIncident.service_id}`
    : 'No service';

  if (!selectedIncident) {
    return <div className="text-sm text-[var(--color-text-secondary)]">No active incidents right now.</div>;
  }

  const severity = incidentSeverity(selectedIncident);
  const confidence = confidenceForIncident(selectedIncident.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <section className="ui-card overflow-hidden">
        <div className="px-4 py-3 text-xs uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Incident queue</div>
        <div>
          {openIncidents.map((incident, index) => (
            <button
              key={incident.id}
              type="button"
              onClick={() => onSelectIncident(incident.id)}
              className={`block w-full border-t border-[var(--color-border)] px-4 py-3 text-left transition ${incident.id === selectedIncident.id
                ? 'bg-[#F3F4F6]'
                : index % 2 === 0
                  ? 'bg-white hover:bg-[#F9FAFB]'
                  : 'hover:bg-[#F9FAFB]'}`}
            >
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{incident.title}</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{formatRelativeTime(incident.created_at)}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="ui-card space-y-6 px-5 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--color-text-secondary)]">{serviceName}</p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{selectedIncident.title}</h1>
          </div>
          <span className={`rounded-md px-3 py-1 text-xs font-semibold uppercase ${severity === 'critical'
            ? 'bg-rose-50 text-rose-600'
            : severity === 'high'
              ? 'bg-amber-50 text-amber-600'
              : 'bg-sky-50 text-sky-600'}`}>
            {severity}
          </span>
        </header>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Root cause</p>
            <p className="mt-2 rounded-md bg-[#F9FAFB] px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)]">
              {incidentRootCause(selectedIncident)}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Confidence score</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{confidence}%</p>
          </div>
        </div>

        <div className="space-y-3">
          <button type="button" className="ui-primary-btn h-11 w-full">
            Fix Issue
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="ui-ghost-btn border border-[var(--color-border)]">Restart</button>
            <button type="button" className="ui-ghost-btn border border-[var(--color-border)]">Scale</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ClustersPage({
  clusters,
  selectedClusterId,
}: {
  clusters: ClusterRecord[];
  selectedClusterId: number | null;
}) {
  return (
    <section>
      <div className="ui-card overflow-x-auto">
        <table className="ui-table min-w-[640px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {clusters.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="ui-table-empty">
                    <CircleDashed size={18} className="ui-table-empty-icon" />
                    <span>No clusters connected yet.</span>
                  </div>
                </td>
              </tr>
            ) : (
              clusters.map((cluster, index) => (
                <tr key={cluster.id} className={`ui-table-row ${index < clusters.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                  <td className="text-[var(--color-text-primary)]">
                    {cluster.name}
                    {cluster.id === selectedClusterId ? <span className="ml-2 rounded-md bg-[#F0FDF4] px-2 py-1 text-[11px] font-semibold text-emerald-700">Active</span> : null}
                  </td>
                  <td className="text-[var(--color-text-secondary)]">{cluster.cluster_type}</td>
                  <td className="text-[var(--color-text-secondary)]">{cluster.status}</td>
                  <td className="text-[var(--color-text-secondary)]">{new Date(cluster.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorkspacePage({
  workspaces,
  selectedWorkspaceId,
}: {
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: number | null;
}) {
  const currentWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  return (
    <div>
      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="ui-card p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Current workspace</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">{currentWorkspace?.name ?? 'No workspace selected'}</h2>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{currentWorkspace?.description ?? 'No description set yet.'}</p>
          <div className="mt-6 inline-flex rounded-md bg-[#F3F4F6] px-3 py-2 text-sm text-[var(--color-text-primary)]">
            Environment: {currentWorkspace?.environment_type ?? 'development'}
          </div>
        </div>

        <div className="ui-card p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Workspace inventory</p>
          <div className="mt-4 space-y-3">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{workspace.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{workspace.environment_type}</p>
                </div>
                {workspace.id === selectedWorkspaceId ? <span className="rounded-md bg-[#F0FDF4] px-2 py-1 text-[11px] font-semibold text-emerald-700">Active</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AddClusterPage({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  onClusterCreated,
}: {
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: number | null;
  onWorkspaceChange: (workspaceId: number) => void;
  onClusterCreated: (cluster: ClusterRecord) => void;
}) {
  return (
    <div>
      <ClusterOnboardingWizard
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onWorkspaceChange={onWorkspaceChange}
        onClusterCreated={onClusterCreated}
      />
    </div>
  );
}

function ChatPage({ incidents, actions }: { incidents: ApiIncident[]; actions: ApiAction[] }) {
  const recentMessages = [
    `Summarize unresolved incidents across ${incidents.filter((incident) => incident.status !== 'resolved').length} active alerts.`,
    `Recommend the next remediation using ${actions.length} historical actions.`,
    'Show the safest rollout plan for the current workspace.',
  ];

  return (
    <section>
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="ui-card p-6">
          <div className="rounded-md border border-[var(--color-border)] bg-[#F9FAFB] px-4 py-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Ask anything about incidents, clusters, or remediation plans.</p>
          </div>
          <textarea rows={8} placeholder="Summarize the highest-risk incident and propose the safest next action..." className="ui-input mt-4 h-auto w-full py-3" />
          <div className="mt-4 flex justify-end">
            <button type="button" className="ui-primary-btn">Send</button>
          </div>
        </div>

        <div className="ui-card p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Suggested prompts</p>
          <div className="mt-4 space-y-3">
            {recentMessages.map((message) => (
              <button key={message} type="button" className="ui-table-row block w-full rounded-md border border-[var(--color-border)] px-4 py-3 text-left text-sm text-[var(--color-text-primary)]">
                {message}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Dashboard({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  clusters,
  selectedClusterId,
  onClusterChange,
  onCreateWorkspace,
  themeMode,
  onThemeChange,
  onLogout,
  onClusterCreated,
}: {
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: number | null;
  onWorkspaceChange: (workspaceId: number) => void;
  clusters: ClusterRecord[];
  selectedClusterId: number | null;
  onClusterChange: (clusterId: number | null) => void;
  onCreateWorkspace: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onLogout: () => void;
  onClusterCreated: (cluster: ClusterRecord) => void;
}) {
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const platformData = usePlatformData();
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const pageMeta = sectionMeta[activeSection];

  useEffect(() => {
    setSearchTerm('');
    setQuickFilter('all');
  }, [activeSection]);

  useEffect(() => {
    const firstOpenIncident = platformData.incidents.find((incident) => incident.status !== 'resolved');
    if (firstOpenIncident && !selectedIncidentId) {
      setSelectedIncidentId(firstOpenIncident.id);
    }
  }, [platformData.incidents, selectedIncidentId]);

  if (!selectedWorkspace) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8 text-[var(--color-text-primary)]">
        <WorkspaceEmptyState onCreateWorkspace={onCreateWorkspace} />
      </div>
    );
  }

  const content = (() => {
    if (activeSection === 'Incidents') {
      return (
        <IncidentsPage
          incidents={platformData.incidents}
          services={platformData.services}
          selectedIncidentId={selectedIncidentId}
          onSelectIncident={setSelectedIncidentId}
        />
      );
    }

    if (activeSection === 'Clusters') {
      return <ClustersPage clusters={clusters} selectedClusterId={selectedClusterId} />;
    }

    if (activeSection === 'Workspace') {
      return <WorkspacePage workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} />;
    }

    if (activeSection === 'Add Cluster') {
      return (
        <AddClusterPage
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onWorkspaceChange={onWorkspaceChange}
          onClusterCreated={onClusterCreated}
        />
      );
    }

    if (activeSection === 'Chat') {
      return <ChatPage incidents={platformData.incidents} actions={platformData.actions} />;
    }

    return (
      <OverviewPage
        services={platformData.services}
        incidents={platformData.incidents}
        loading={platformData.loading}
        error={platformData.error}
        onFix={(incidentId) => {
          setSelectedIncidentId(incidentId);
          setActiveSection('Incidents');
        }}
      />
    );
  })();

  const workspaceName = selectedWorkspace.name;
  const userLabel = (workspaceName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'AO').slice(0, 2);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <Sidebar
        activeSection={activeSection}
        onSelect={(section: string) => setActiveSection(section as Section)}
        workspaceName={workspaceName}
        userLabel={userLabel}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
      />

      <main className={`min-h-screen px-6 py-6 transition-[margin-left] duration-200 ease-in-out lg:px-8 ${isSidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[220px]'}`}>
        <div className="mx-auto max-w-[1440px]">
          <Header
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onWorkspaceChange={onWorkspaceChange}
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onClusterChange={onClusterChange}
            themeMode={themeMode}
            onThemeChange={onThemeChange}
            onLogout={onLogout}
          />
          <section className="mb-6 space-y-4">
            <header>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{pageMeta.title}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{pageMeta.subtitle}</p>
            </header>

            <div className="ui-card flex flex-wrap items-center gap-3 p-4">
              <div className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1">
                <Filter size={18} className="text-[var(--color-text-muted)]" />
                <select value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)} className="ui-input h-8 min-w-[160px] border-0 p-0 focus:shadow-none">
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="healthy">Healthy</option>
                  <option value="flagged">Flagged</option>
                </select>
              </div>

              <div className="relative min-w-[220px] flex-1">
                <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-light)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={pageMeta.searchPlaceholder}
                  className="ui-input w-full pl-9"
                />
              </div>

              <button type="button" className="ui-ghost-btn gap-2 border border-[var(--color-border)]">
                <RefreshCw size={18} />
                Refresh
              </button>
              <button type="button" onClick={onCreateWorkspace} className="ui-primary-btn">+ Workspace</button>
            </div>
          </section>

          <div className="space-y-6">
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [clusters, setClusters] = useState<ClusterRecord[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const storedTheme = localStorage.getItem('ui_theme');
    return storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'auto' ? storedTheme : 'light';
  });

  useEffect(() => {
    const htmlElement = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const shouldUseDark = themeMode === 'dark' || (themeMode === 'auto' && mediaQuery.matches);
      htmlElement.classList.toggle('dark', shouldUseDark);
    };

    applyTheme();
    localStorage.setItem('ui_theme', themeMode);

    const onMediaChange = () => {
      if (themeMode === 'auto') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', onMediaChange);
    return () => mediaQuery.removeEventListener('change', onMediaChange);
  }, [themeMode]);

  const persistAccessToken = (accessToken: string) => {
    document.cookie = `access_token=${accessToken}; path=/; samesite=lax; max-age=${60 * 60 * 24}`;
    localStorage.setItem('access_token', accessToken);
    setIsAuthenticated(true);
  };

  const loadClusters = async (workspaceId: number) => {
    const response = await fetch(`${API_BASE_URL}/clusters/?workspace_id=${workspaceId}`, {
      headers: getAuthenticatedHeaders(),
    });

    if (!response.ok) {
      setClusters([]);
      setSelectedClusterId(null);
      return;
    }

    const data = (await response.json()) as ClusterRecord[];
    setClusters(data);

    const savedClusterId = Number(localStorage.getItem('cluster_id') ?? '');
    const preferredClusterId = data.some((cluster) => cluster.id === savedClusterId)
      ? savedClusterId
      : data[0]?.id ?? null;

    setSelectedClusterId(preferredClusterId);
    if (preferredClusterId) {
      localStorage.setItem('cluster_id', String(preferredClusterId));
    } else {
      localStorage.removeItem('cluster_id');
    }
  };

  const loadWorkspaces = async () => {
    const [workspaceListResponse, currentWorkspaceResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/workspaces/`, { headers: getAuthenticatedHeaders() }),
      fetch(`${API_BASE_URL}/workspaces/me`, { headers: getAuthenticatedHeaders() }),
    ]);

    const workspaceList = workspaceListResponse.ok
      ? ((await workspaceListResponse.json()) as WorkspaceRecord[]).map(normalizeWorkspace)
      : [];
    const currentWorkspace = currentWorkspaceResponse.ok
      ? normalizeWorkspace(await currentWorkspaceResponse.json() as WorkspaceRecord)
      : null;

    const nextWorkspaces = workspaceList.length > 0 ? workspaceList : currentWorkspace ? [currentWorkspace] : [];
    setWorkspaces(nextWorkspaces);

    const nextSelectedWorkspaceId = currentWorkspace?.id ?? nextWorkspaces[0]?.id ?? null;
    setSelectedWorkspaceId(nextSelectedWorkspaceId);

    if (currentWorkspace) {
      localStorage.setItem('workspace_id', String(currentWorkspace.id));
      localStorage.setItem('workspace_name', currentWorkspace.name);
    } else {
      localStorage.removeItem('workspace_id');
      localStorage.removeItem('workspace_name');
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      const token = getStoredAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      try {
        await loadWorkspaces();
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !selectedWorkspaceId) {
      setClusters([]);
      setSelectedClusterId(null);
      return;
    }

    void loadClusters(selectedWorkspaceId);
  }, [isAuthenticated, selectedWorkspaceId]);

  const handleLogin = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail ?? 'Invalid email or password.');
    }

    persistAccessToken(data.access_token);
    await loadWorkspaces();
  };

  const handleSignup = async (name: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail ?? 'Failed to create account.');
    }

    persistAccessToken(data.access_token);
    await loadWorkspaces();
  };

  const handleGoogleLogin = async () => {
    window.location.assign(`${API_BASE_URL}/auth/google/login?redirect=true`);
  };

  const handleWorkspaceChange = async (workspaceId: number) => {
    const response = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/select`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
    });

    if (!response.ok) {
      return;
    }

    const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
    setSelectedWorkspaceId(workspaceId);
    if (selectedWorkspace) {
      localStorage.setItem('workspace_id', String(selectedWorkspace.id));
      localStorage.setItem('workspace_name', selectedWorkspace.name);
    }
  };

  const handleCreateWorkspace = async (name: string, environmentType: string) => {
    const response = await fetch(`${API_BASE_URL}/workspaces/`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({
        name,
        environment_type: environmentType,
        description: `${environmentType} workspace`,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail ?? 'Failed to create workspace.');
    }

    await loadWorkspaces();
    setSelectedWorkspaceId(data.id);
    localStorage.setItem('workspace_id', String(data.id));
    localStorage.setItem('workspace_name', data.name);
  };

  const handleClusterCreated = (cluster: ClusterRecord) => {
    setClusters((currentClusters) => [cluster, ...currentClusters.filter((item) => item.id !== cluster.id)]);
    setSelectedClusterId(cluster.id);
    localStorage.setItem('cluster_id', String(cluster.id));
  };

  const handleClusterChange = (clusterId: number | null) => {
    setSelectedClusterId(clusterId);
    if (clusterId) {
      localStorage.setItem('cluster_id', String(clusterId));
    } else {
      localStorage.removeItem('cluster_id');
    }
  };

  const handleLogout = () => {
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'access_token=; path=/; max-age=0';
    localStorage.removeItem('access_token');
    localStorage.removeItem('workspace_id');
    localStorage.removeItem('workspace_name');
    localStorage.removeItem('cluster_id');
    setIsAuthenticated(false);
    setWorkspaces([]);
    setSelectedWorkspaceId(null);
    setClusters([]);
    setSelectedClusterId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  return (
    <Router>
      <CreateWorkspaceModal
        open={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
        onCreate={handleCreateWorkspace}
      />
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage onLogin={handleLogin} onSignup={handleSignup} onGoogleLogin={handleGoogleLogin} />
            )
          }
        />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route
          path="/dashboard"
          element={
            isAuthenticated ? (
              <Dashboard
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                onWorkspaceChange={handleWorkspaceChange}
                clusters={clusters}
                selectedClusterId={selectedClusterId}
                onClusterChange={handleClusterChange}
                onCreateWorkspace={() => setWorkspaceModalOpen(true)}
                themeMode={themeMode}
                onThemeChange={setThemeMode}
                onLogout={handleLogout}
                onClusterCreated={handleClusterCreated}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
