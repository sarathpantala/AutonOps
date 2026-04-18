import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Filter, RefreshCw, Search, Send, Server, Sparkles, TrendingUp, Zap, ChevronRight, Terminal, Shield, Info } from 'lucide-react';
import ClusterOnboardingWizard from './components/ClusterOnboardingWizard';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import OAuthCallback from './components/OAuthCallback';
import Sidebar from './components/Sidebar';
import { API_BASE_URL } from './lib/api';

type Section = 'Overview' | 'Incidents' | 'Services' | 'Chat';
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
  Chat: {
    title: 'Chat',
    subtitle: 'Ask the AI operator for summaries, fixes, and safe rollout guidance.',
    searchPlaceholder: 'Search prompts',
  },
  Services: {
    title: 'Services',
    subtitle: 'Monitor service health, resource usage, and active incidents per service.',
    searchPlaceholder: 'Search services',
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
  incident_id?: number | null;
  description: string;
  status?: string;
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

type UserProfile = {
  name: string;
  email: string;
  picture: string;
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

function usePlatformData(selectedClusterId: number | null, selectedWorkspaceId: number | null) {
  const [services, setServices] = useState<ApiService[]>([]);
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [actions, setActions] = useState<ApiAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');

      if (!selectedWorkspaceId || !selectedClusterId) {
        setServices([]);
        setIncidents([]);
        setActions([]);
        setLoading(false);
        return;
      }

      try {
        const runtimeResponse = await fetch(`${API_BASE_URL}/clusters/${selectedClusterId}/runtime-summary`, {
          headers: getAuthenticatedHeaders(),
        });
        if (!runtimeResponse.ok) {
          throw new Error('Failed to load cluster runtime data');
        }
        const runtimeData = await runtimeResponse.json() as { services: ApiService[]; incidents: ApiIncident[] };
        const servicesData = runtimeData.services ?? [];
        const incidentsData = runtimeData.incidents ?? [];

        const actionsUrl = selectedClusterId
          ? `${API_BASE_URL}/actions/?cluster_id=${selectedClusterId}`
          : `${API_BASE_URL}/actions/`;
        const actionsResponse = await fetch(actionsUrl, {
          headers: getAuthenticatedHeaders(),
        });
        if (!actionsResponse.ok) {
          throw new Error('Failed to load actions');
        }
        const actionsData = await actionsResponse.json() as ApiAction[];

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
  }, [selectedClusterId, selectedWorkspaceId]);

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

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="ui-card flex items-start gap-4 p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent ?? 'bg-[#F3F4F6]'}`}>
        <Icon size={20} className={accent ? 'text-white' : 'text-[var(--color-text-muted)]'} />
      </div>
      <div>
        <p className="ui-section-label">{label}</p>
        <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{sub}</p> : null}
      </div>
    </div>
  );
}

function OverviewPage({
  services,
  incidents,
  actions,
  loading,
  error,
  onFix,
}: {
  services: ApiService[];
  incidents: ApiIncident[];
  actions: ApiAction[];
  loading: boolean;
  error: string;
  onFix: (incidentId: number) => void;
}) {
  const openIncidents = incidents.filter((incident) => incident.status !== 'resolved').slice(0, 8);
  const healthyServices = services.filter((s) => s.is_active).length;
  const actionCount = actions.length;
  const impactedServiceCount = new Set(openIncidents.map((incident) => incident.service_id)).size;
  const serviceNameById = useMemo(() => {
    const map = new Map<number, string>();
    services.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [services]);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Incidents"
          value={loading ? '—' : openIncidents.length}
          sub={openIncidents.length > 0 ? 'Requires attention' : 'All clear'}
          icon={AlertTriangle}
          accent={openIncidents.length > 0 ? 'bg-rose-500' : undefined}
        />
        <StatCard
          label="Service Health"
          value={loading ? '—' : `${healthyServices} / ${services.length}`}
          sub="Healthy services"
          icon={Activity}
          accent={healthyServices === services.length && services.length > 0 ? 'bg-emerald-500' : undefined}
        />
        <StatCard
          label="Impacted Services"
          value={loading ? '—' : impactedServiceCount}
          sub="Services with open incidents"
          icon={TrendingUp}
        />
        <StatCard
          label="Recorded Actions"
          value={loading ? '—' : actionCount}
          sub="Actions persisted for this cluster"
          icon={Zap}
        />
      </div>

      {/* Active Incidents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Active Incidents</h2>
          <span className="text-xs text-[var(--color-text-muted)]">Fix highest severity first</span>
        </div>
        <div className="ui-card overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm text-[var(--color-text-secondary)]">
              <CircleDashed size={16} className="animate-spin" />
              Loading incidents...
            </div>
          ) : openIncidents.length === 0 ? (
            <div className="ui-table-empty py-8">
              <CheckCircle2 size={20} className="text-emerald-500" />
              <span className="font-medium text-[var(--color-text-primary)]">No active incidents</span>
              <span className="text-xs text-[var(--color-text-muted)]">Your systems are operating normally.</span>
            </div>
          ) : (
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Summary</th>
                  <th>Severity</th>
                  <th>Detected</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openIncidents.map((incident, index) => {
                  const severity = incidentSeverity(incident);
                  return (
                    <tr
                      key={incident.id}
                      className={`ui-table-row ${index < openIncidents.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}
                    >
                      <td className="font-medium text-[var(--color-text-primary)]">
                        {serviceNameById.get(incident.service_id) ?? `Service #${incident.service_id}`}
                      </td>
                      <td className="max-w-[260px] truncate text-[var(--color-text-secondary)]">{incident.title}</td>
                      <td>
                        <span className={`ui-badge ${severity === 'critical' ? 'ui-badge-red' : severity === 'high' ? 'ui-badge-amber' : 'ui-badge-blue'}`}>
                          {severity}
                        </span>
                      </td>
                      <td className="tabular-nums text-[var(--color-text-muted)]">{formatRelativeTime(incident.created_at)}</td>
                      <td className="text-right">
                        <button type="button" onClick={() => onFix(incident.id)} className="ui-primary-btn h-8 px-3 text-xs">
                          Fix
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Service Health */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Service Health</h2>
          <span className="text-xs text-[var(--color-text-muted)]">Stabilize unhealthy services</span>
        </div>
        <div className="ui-card overflow-x-auto">
          <table className="ui-table min-w-[560px]">
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
                      <CircleDashed size={18} className="ui-table-empty-icon animate-spin" />
                      <span>Loading services...</span>
                    </div>
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="ui-table-empty">
                      <Server size={18} className="ui-table-empty-icon" />
                      <span>No services available. Connect a cluster to begin.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                services.map((service, index) => (
                  <tr key={service.id} className={`ui-table-row ${index < services.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                    <td className="font-medium text-[var(--color-text-primary)]">{service.name}</td>
                    <td>
                      <span className={`ui-badge ${service.is_active ? 'ui-badge-green' : 'ui-badge-gray'}`}>
                        {service.is_active ? 'Healthy' : 'Inactive'}
                      </span>
                    </td>
                    <td className="tabular-nums text-[var(--color-text-secondary)]">N/A</td>
                    <td className="tabular-nums text-[var(--color-text-secondary)]">N/A</td>
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
  onOpenChat,
}: {
  incidents: ApiIncident[];
  services: ApiService[];
  selectedIncidentId: number | null;
  onSelectIncident: (incidentId: number) => void;
  onOpenChat: () => void;
}) {
  const openIncidents = incidents.filter((incident) => incident.status !== 'resolved');
  const selectedIncident = openIncidents.find((incident) => incident.id === selectedIncidentId) ?? openIncidents[0] ?? null;
  const serviceName = selectedIncident
    ? services.find((service) => service.id === selectedIncident.service_id)?.name ?? `Service #${selectedIncident.service_id}`
    : 'No service';

  if (!selectedIncident) {
    return (
      <div className="ui-card px-6 py-12 text-center">
        <CheckCircle2 size={24} className="mx-auto mb-3 text-emerald-500" />
        <p className="font-medium text-[var(--color-text-primary)]">No active incidents</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your systems are operating normally.</p>
      </div>
    );
  }
  const severity = incidentSeverity(selectedIncident);

  return (
    <div className="flex gap-6">
      {/* Left: incident list */}
      <aside className="hidden w-[280px] shrink-0 lg:block">
        <div className="ui-card overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <p className="ui-section-label">Queue · {openIncidents.length}</p>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {openIncidents.map((incident) => {
              const sev = incidentSeverity(incident);
              const isActive = incident.id === selectedIncident.id;
              return (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => onSelectIncident(incident.id)}
                  className={`w-full px-4 py-3 text-left transition duration-100 ease-out ${isActive ? 'border-l-2 border-l-[var(--color-primary)] bg-[#F9FAFB]' : 'hover:bg-[#F9FAFB]'}`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={`ui-badge ${sev === 'critical' ? 'ui-badge-red' : sev === 'high' ? 'ui-badge-amber' : 'ui-badge-blue'}`}>
                      {sev}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">{formatRelativeTime(incident.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium leading-5 text-[var(--color-text-primary)]">{incident.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {services.find((s) => s.id === incident.service_id)?.name ?? `Service #${incident.service_id}`}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Right: detail panel */}
      <section className="min-w-0 flex-1">
        <div className="ui-card space-y-6 p-6">
          {/* Header */}
          <header>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`ui-badge ${severity === 'critical' ? 'ui-badge-red' : severity === 'high' ? 'ui-badge-amber' : 'ui-badge-blue'}`}>
                {severity}
              </span>
              <span className="ui-badge ui-badge-gray">{selectedIncident.status}</span>
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{selectedIncident.title}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {serviceName} · detected {formatRelativeTime(selectedIncident.created_at)}
            </p>
          </header>

          {/* Root cause */}
          <div>
            <p className="ui-section-label mb-2">Root Cause</p>
            <div className="rounded-md border border-[var(--color-border)] bg-[#F9FAFB] px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)]">
              {selectedIncident.title}
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                No verified root-cause explanation is available from current runtime data. Use Chat for cluster-aware analysis before applying remediation.
              </p>
            </div>
          </div>

          {/* Risk */}
          <div className="grid gap-4 sm:grid-cols-1">
            <div className="rounded-lg border border-[var(--color-border)] p-4">
              <p className="ui-section-label">Risk Level</p>
              <div className="mt-2">
                <span className={`ui-badge ${severity === 'critical' ? 'ui-badge-red' : severity === 'high' ? 'ui-badge-amber' : 'ui-badge-blue'}`}>
                  {severity === 'critical' ? 'High' : severity === 'high' ? 'Medium' : 'Low'}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                {severity === 'critical'
                  ? 'Service is degraded or unavailable. Immediate action required.'
                  : severity === 'high'
                    ? 'Elevated impact. Review recommended before proceeding.'
                    : 'Contained issue. Monitor and apply safe remediation.'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="ui-section-label mb-3">Next Step</p>
            <div className="rounded-md border border-[var(--color-border)] bg-[#F9FAFB] p-4">
              <p className="text-sm text-[var(--color-text-primary)]">No static remediation actions are shown here.</p>
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
                Generate cluster-aware recommendations from live cluster context in Chat, then review risk and approve execution there.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="ui-primary-btn h-10 px-4 text-sm"
                >
                  Open Chat Analysis
                </button>
              </div>
            </div>
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
                    <Server size={18} className="ui-table-empty-icon" />
                    <span>No clusters connected yet. Add your first cluster to get started.</span>
                  </div>
                </td>
              </tr>
            ) : (
              clusters.map((cluster, index) => (
                <tr key={cluster.id} className={`ui-table-row ${index < clusters.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--color-text-primary)]">{cluster.name}</span>
                      {cluster.id === selectedClusterId ? <span className="ui-badge ui-badge-green">Active</span> : null}
                    </div>
                  </td>
                  <td className="text-[var(--color-text-secondary)]">{cluster.cluster_type}</td>
                  <td>
                    <span className={`ui-badge ${cluster.status === 'active' || cluster.status === 'healthy' ? 'ui-badge-green' : cluster.status === 'error' || cluster.status === 'failed' ? 'ui-badge-red' : 'ui-badge-gray'}`}>
                      {cluster.status}
                    </span>
                  </td>
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

function ServicesPage({
  services,
  incidents,
  loading,
}: {
  services: ApiService[];
  incidents: ApiIncident[];
  loading: boolean;
}) {
  const incidentCountByService = useMemo(() => {
    const map = new Map<number, number>();
    incidents
      .filter((inc) => inc.status !== 'resolved')
      .forEach((inc) => map.set(inc.service_id, (map.get(inc.service_id) ?? 0) + 1));
    return map;
  }, [incidents]);

  return (
    <section>
      <div className="ui-card overflow-x-auto">
        <table className="ui-table min-w-[700px]">
          <thead>
            <tr>
              <th>Service</th>
              <th>Health</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Active Incidents</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="ui-table-empty">
                    <CircleDashed size={18} className="ui-table-empty-icon animate-spin" />
                    <span>Loading services...</span>
                  </div>
                </td>
              </tr>
            ) : services.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="ui-table-empty">
                    <Activity size={18} className="ui-table-empty-icon" />
                    <span>No services found. Connect a cluster to get started.</span>
                  </div>
                </td>
              </tr>
            ) : (
              services.map((service, index) => {
                const activeIncidentCount = incidentCountByService.get(service.id) ?? 0;
                return (
                  <tr key={service.id} className={`ui-table-row ${index < services.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}>
                    <td>
                      <p className="font-medium text-[var(--color-text-primary)]">{service.name}</p>
                    </td>
                    <td>
                      <span className={`ui-badge ${service.is_active ? 'ui-badge-green' : 'ui-badge-gray'}`}>
                        {service.is_active ? 'Healthy' : 'Inactive'}
                      </span>
                    </td>
                    <td className="tabular-nums text-[var(--color-text-secondary)]">N/A</td>
                    <td className="tabular-nums text-[var(--color-text-secondary)]">N/A</td>
                    <td>
                      {activeIncidentCount > 0 ? (
                        <span className="ui-badge ui-badge-red">{activeIncidentCount}</span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
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
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{currentWorkspace?.description || '—'}</p>
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

function ChatPage({
  incidents,
  actions,
  selectedClusterId,
  selectedWorkspaceId,
  clusters,
}: {
  incidents: ApiIncident[];
  actions: ApiAction[];
  selectedClusterId: number | null;
  selectedWorkspaceId: number | null;
  clusters: ClusterRecord[];
}) {
  // ── Types ────────────────────────────────────────────────────────
  type IssueSeverity = 'low' | 'medium' | 'high';
  type IssueItem = { service: string; problem: string; severity: IssueSeverity; reason: string };
  type ActionItem = {
    action_id?: number;
    action: string;
    command: string;
    risk: string;
    requires_approval: boolean;
    type?: string;
    target?: Record<string, string>;
    command_payload?: Record<string, unknown>;
    status?: 'pending' | 'running' | 'done' | 'error' | 'rejected';
  };
  type AIResult = {
    session_id: number;
    summary: string;
    issues: IssueItem[];
    recommended_actions: ActionItem[];
    confidence: number;
  };
  type ConvTurn = { role: 'user' | 'assistant'; text: string; result?: AIResult };
  type StreamStatus = 'idle' | 'collecting' | 'analyzing' | 'done' | 'error';

  // ── State ────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState('');
  const [conversation, setConversation] = useState<ConvTurn[]>([]);
  const [latestResult, setLatestResult] = useState<AIResult | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [streamStatusText, setStreamStatusText] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({});
  const [approvalAction, setApprovalAction] = useState<{
    actionId: number;
    label: string;
    command: string;
    diagnostic: boolean;
  } | null>(null);
  // Auto-analysis
  const [autoResult, setAutoResult] = useState<AIResult | null>(null);
  const [autoIssueCount, setAutoIssueCount] = useState(0);
  const [showAutoBanner, setShowAutoBanner] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openIncidentCount = incidents.filter((inc) => inc.status !== 'resolved').length;
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);

  const isDiagnosticAction = (action: ActionItem) => {
    const combined = `${action.action} ${action.command}`.toLowerCase();
    if (/^\s*kubectl\s+(logs|describe|get|top)\b/.test(action.command.toLowerCase())) {
      return true;
    }
    return /(inspect|describe|log|logs|diagnos|debug|check|triage|observe)/.test(combined);
  };

  // ── Auto-scroll ──────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, streamStatus]);

  // ── Auto-analysis every 30 s ─────────────────────────────────────
  useEffect(() => {
    if (!selectedClusterId) return;

    const runAutoAnalysis = async () => {
      if (autoRunning) return;
      setAutoRunning(true);
      try {
        const fallbackWs = Number(localStorage.getItem('workspace_id') ?? '');
        const wsId = selectedWorkspaceId ?? (Number.isFinite(fallbackWs) ? fallbackWs : null);
        if (!wsId) return;

        const res = await fetch(`${API_BASE_URL}/chat/query`, {
          method: 'POST',
          headers: getAuthenticatedHeaders(),
          body: JSON.stringify({ query: 'Summarize cluster health and list any active issues.', workspace_id: wsId, cluster_id: selectedClusterId }),
        });
        if (!res.ok) return;
        const data = await res.json() as AIResult;
        const issueCount = (data.issues ?? []).filter((i) => i.severity === 'high' || i.severity === 'medium').length;
        if (issueCount > 0) {
          setAutoResult(data);
          setAutoIssueCount(issueCount);
          setShowAutoBanner(true);
        }
      } catch { /* silent */ }
      finally { setAutoRunning(false); }
    };

    void runAutoAnalysis();
    const interval = setInterval(() => void runAutoAnalysis(), 30_000);
    return () => clearInterval(interval);
  }, [selectedClusterId, selectedWorkspaceId]);

  // ── Send (streaming) ─────────────────────────────────────────────
  const sendPrompt = async (override?: string) => {
    const prompt = (override ?? inputValue).trim();
    if (!prompt || streamStatus === 'collecting' || streamStatus === 'analyzing') return;

    const fallbackWs = Number(localStorage.getItem('workspace_id') ?? '');
    const wsId = selectedWorkspaceId ?? (Number.isFinite(fallbackWs) ? fallbackWs : null);
    if (!wsId) {
      setConversation((prev) => [...prev, { role: 'assistant', text: 'Select a workspace before starting a conversation.' }]);
      return;
    }

    setConversation((prev) => [...prev, { role: 'user', text: prompt }]);
    setInputValue('');
    setStreamStatus('collecting');
    setStreamStatusText('Collecting cluster context…');
    setLatestResult(null);

    try {
      // Use fetch + manual SSE parse (EventSource doesn't support POST)
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: getAuthenticatedHeaders(),
        body: JSON.stringify({ query: prompt, workspace_id: wsId, cluster_id: selectedClusterId, session_id: sessionId }),
      });

      if (!response.ok || !response.body) {
        const errData = await response.json() as { detail?: string };
        throw new Error(errData.detail ?? 'Stream request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as { type: string; text?: string; detail?: string } & Partial<AIResult>;
            if (event.type === 'status') {
              setStreamStatusText(event.text ?? '');
              setStreamStatus('analyzing');
            } else if (event.type === 'result') {
              const result: AIResult = {
                session_id: event.session_id ?? 0,
                summary: event.summary ?? '',
                issues: (event.issues ?? []) as IssueItem[],
                recommended_actions: (event.recommended_actions ?? []) as ActionItem[],
                confidence: event.confidence ?? 0,
              };
              setSessionId(result.session_id);
              setLatestResult(result);
              setConversation((prev) => [
                ...prev,
                { role: 'assistant', text: result.summary, result },
              ]);
              setStreamStatus('done');
            } else if (event.type === 'error') {
              throw new Error(event.detail ?? 'Analysis error');
            }
          } catch (parseErr) {
            // skip malformed event
          }
        }
      }
    } catch (err) {
      setConversation((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : 'Request failed'}` },
      ]);
      setStreamStatus('error');
      setTimeout(() => setStreamStatus('idle'), 2000);
    }
  };

  // ── Action execution ─────────────────────────────────────────────
  const executeApprovedAction = async (actionId: number, actionLabel: string, diagnostic: boolean) => {
    const key = String(actionId);
    setActionStates((prev) => ({ ...prev, [key]: 'running' }));
    try {
      const approveRes = await fetch(`${API_BASE_URL}/actions/${actionId}/approve`, {
        method: 'POST', headers: getAuthenticatedHeaders(), body: JSON.stringify({}),
      });
      if (!approveRes.ok) throw new Error((await approveRes.json() as { detail?: string }).detail ?? 'Approve failed');

      const execRes = await fetch(`${API_BASE_URL}/actions/${actionId}/execute`, {
        method: 'POST', headers: getAuthenticatedHeaders(), body: JSON.stringify({}),
      });
      if (!execRes.ok) throw new Error((await execRes.json() as { detail?: string }).detail ?? 'Execute failed');
      const execData = await execRes.json() as { execution_result?: string };

      setActionStates((prev) => ({ ...prev, [key]: 'done' }));
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: execData.execution_result
            ? `${diagnostic ? 'Diagnostic completed' : 'Fix applied'}: ${actionLabel}\n${execData.execution_result}`
            : `${diagnostic ? 'Diagnostic completed' : 'Fix applied'}: ${actionLabel}`,
        },
      ]);
      // Update action status in latestResult
      setLatestResult((prev) => prev ? {
        ...prev,
        recommended_actions: prev.recommended_actions.map((a) =>
          a.action_id === actionId ? { ...a, status: 'done' as const } : a
        ),
      } : prev);
    } catch (err) {
      setActionStates((prev) => ({ ...prev, [key]: 'error' }));
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Failed to execute ${diagnostic ? 'diagnostic action' : 'fix'}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ]);
    }
  };

  const requestActionExecution = (action: ActionItem) => {
    if (!action.action_id) return;
    setApprovalAction({
      actionId: action.action_id,
      label: action.action,
      command: action.command,
      diagnostic: isDiagnosticAction(action),
    });
  };

  const rejectActionItem = async (actionId: number | undefined) => {
    if (!actionId) return;
    await fetch(`${API_BASE_URL}/actions/${actionId}/reject`, {
      method: 'POST', headers: getAuthenticatedHeaders(), body: JSON.stringify({ notes: 'Rejected via chat UI' }),
    });
    setLatestResult((prev) => prev ? {
      ...prev,
      recommended_actions: prev.recommended_actions.map((a) =>
        a.action_id === actionId ? { ...a, status: 'rejected' as const } : a
      ),
    } : prev);
  };

  // ── Helpers ──────────────────────────────────────────────────────
  const severityColor = (s: IssueSeverity) =>
    s === 'high' ? 'bg-red-100 text-red-700 border-red-200' :
    s === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-emerald-100 text-emerald-700 border-emerald-200';

  const riskColor = (r: string) =>
    r === 'high' ? 'bg-red-50 text-red-600 border-red-200' :
    r === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-200' :
    'bg-emerald-50 text-emerald-600 border-emerald-200';

  const riskBtnColor = (r: string) =>
    r === 'high' ? 'bg-red-600 hover:bg-red-700' :
    r === 'medium' ? 'bg-amber-600 hover:bg-amber-700' :
    'bg-emerald-600 hover:bg-emerald-700';

  const isProcessing = streamStatus === 'collecting' || streamStatus === 'analyzing';

  const quickPrompts = [
    { label: 'Why are pods restarting?', icon: AlertTriangle },
    { label: 'Show unhealthy services', icon: Activity },
    { label: 'Suggest cost optimizations', icon: TrendingUp },
    { label: 'What caused recent failures?', icon: Zap },
    { label: 'Scale recommendations', icon: Server },
  ];

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ─── Auto-analysis banner ─── */}
      {showAutoBanner && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={15} className="shrink-0" />
            <span><strong>{autoIssueCount} issue{autoIssueCount !== 1 ? 's' : ''} detected</strong> in cluster — AI analysis ready</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (autoResult) {
                  setLatestResult(autoResult);
                  setConversation((prev) => [...prev, { role: 'assistant', text: autoResult.summary, result: autoResult }]);
                  setStreamStatus('done');
                }
                setShowAutoBanner(false);
              }}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-transform active:scale-95"
            >
              View Analysis
            </button>
            <button type="button" onClick={() => setShowAutoBanner(false)} className="text-amber-600 hover:text-amber-800 text-xs">Dismiss</button>
          </div>
        </div>
      )}

      {/* ─── Context bar ─── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-xs text-[var(--color-text-secondary)]">
        <div className="flex items-center gap-1.5">
          <Server size={12} className="text-[var(--color-text-muted)]" />
          <span className="font-medium text-[var(--color-text-primary)]">{selectedCluster?.name ?? 'No cluster'}</span>
        </div>
        <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
        <span>{selectedCluster?.cluster_type ?? '—'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${selectedClusterId ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <span>{selectedClusterId ? 'Connected' : 'No cluster selected'}</span>
        </span>
        {openIncidentCount > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
            <AlertTriangle size={10} />
            {openIncidentCount} active incident{openIncidentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ─── Main split panel ─── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]" style={{ minHeight: '68vh' }}>

        {/* LEFT: conversation timeline */}
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">

          {/* Timeline header */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-3">
            <Sparkles size={15} className="text-emerald-600" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">AI Operator</span>
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">AutonOps · live cluster context</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {conversation.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <Sparkles size={24} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">AI SRE Operator</p>
                  <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
                    I analyze your live Kubernetes cluster — pods, events, deployments — and suggest safe, targeted actions.
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 w-full max-w-sm">
                  {quickPrompts.map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => void sendPrompt(label)}
                      className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[#F8FAFC] px-3.5 py-2.5 text-left text-xs text-[var(--color-text-secondary)] transition-all duration-150 hover:bg-white hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <Icon size={13} className="shrink-0 text-emerald-600" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              conversation.map((turn, idx) => (
                <div key={idx} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                    turn.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-[var(--color-border)] bg-[#F8FAFC] text-[var(--color-text-primary)]'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
                  </div>
                </div>
              ))
            )}

            {/* Loading shimmer */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-[var(--color-border)] bg-[#F8FAFC] px-4 py-3 text-sm max-w-sm">
                  <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs">{streamStatusText}</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div className="h-2.5 w-48 rounded bg-gray-200 animate-pulse" />
                    <div className="h-2.5 w-36 rounded bg-gray-200 animate-pulse" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--color-border)] bg-white px-4 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[#F8FAFC] px-3 py-2 focus-within:border-emerald-400 focus-within:bg-white transition-colors">
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendPrompt(); }
                }}
                placeholder="Ask about incidents, failures, scaling, or cost optimization…"
                className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
                disabled={isProcessing}
              />
              <button
                type="button"
                onClick={() => void sendPrompt()}
                disabled={isProcessing || !inputValue.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white transition-all hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)] px-1">
              {isProcessing ? streamStatusText : 'AutonOps AI · live cluster data · safe-first recommendations'}
            </p>
          </div>
        </div>

        {/* RIGHT: AI Insights panel */}
        <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: '72vh' }}>

          {!latestResult ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-emerald-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">AI Insights</span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">Send a query to see structured analysis: issues, root causes, and one-click remediation actions.</p>
              <div className="mt-4 space-y-2">
                {['Issue cards with severity', 'Root cause per service', 'kubectl-ready actions', 'Risk-annotated execution'].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Summary card */}
              <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Info size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Summary</span>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[#F8FAFC] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">
                    {Math.round(latestResult.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-primary)]">{latestResult.summary}</p>
              </div>

              {/* Issues */}
              {latestResult.issues.length > 0 && (
                <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <AlertTriangle size={13} className="text-amber-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Issues Detected ({latestResult.issues.length})
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {latestResult.issues.map((issue, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-[var(--color-border)] bg-[#F8FAFC] p-3 transition-all hover:shadow-sm hover:bg-white cursor-default"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-[var(--color-text-primary)]">{issue.service}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${severityColor(issue.severity)}`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-text-primary)]">{issue.problem}</p>
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)] leading-relaxed">{issue.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {latestResult.recommended_actions.length > 0 && (
                <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Terminal size={13} className="text-blue-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Recommended Actions ({latestResult.recommended_actions.length})
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {latestResult.recommended_actions.map((act, i) => {
                      const key = String(act.action_id ?? `tmp-${i}`);
                      const state = actionStates[key];
                      const isDone = act.status === 'done' || state === 'done';
                      const isRejected = act.status === 'rejected';
                      const isRunning = state === 'running';
                      const diagnostic = isDiagnosticAction(act);
                      return (
                        <div
                          key={i}
                          className="rounded-lg border border-[var(--color-border)] bg-[#F8FAFC] p-3 transition-all hover:shadow-sm hover:bg-white"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--color-text-primary)]">{act.action}</p>
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                {diagnostic ? 'diagnostic' : 'remediation'}
                              </span>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskColor(act.risk)}`}>
                                {act.risk}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1.5">
                            <Terminal size={10} className="shrink-0 text-gray-400" />
                            <code className="text-[10px] text-gray-600 break-all font-mono">{act.command}</code>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            {isDone ? (
                              <span className="text-[11px] font-medium text-emerald-600">{diagnostic ? 'Executed' : 'Applied'}</span>
                            ) : isRejected ? (
                              <span className="text-[11px] text-[var(--color-text-muted)]">Rejected</span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isRunning || !act.action_id}
                                  onClick={() => requestActionExecution(act)}
                                  className={`rounded-md px-3 py-1 text-[11px] font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 ${riskBtnColor(act.risk)}`}
                                >
                                  {isRunning ? (diagnostic ? 'Running…' : 'Applying…') : (diagnostic ? 'Run diagnostic' : 'Apply fix')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isRunning}
                                  onClick={() => void rejectActionItem(act.action_id)}
                                  className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-gray-100 transition-all active:scale-[0.98]"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {act.requires_approval && !isDone && !isRejected && !diagnostic && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-600">
                                <Shield size={10} /> Approval required
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No issues */}
              {latestResult.issues.length === 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Cluster Healthy</p>
                    <p className="text-xs text-emerald-700 mt-0.5">No issues detected in the current analysis.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Quick prompts */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2.5">Quick Queries</p>
            <div className="space-y-1.5">
              {quickPrompts.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void sendPrompt(label)}
                  disabled={isProcessing}
                  className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-all hover:bg-[#F8FAFC] hover:text-[var(--color-text-primary)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
                >
                  <Icon size={12} className="shrink-0 text-emerald-600" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {approvalAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Approval required</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
              {approvalAction.diagnostic ? 'Run diagnostic command?' : 'Apply remediation command?'}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{approvalAction.label}</p>
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[#F8FAFC] p-3">
              <code className="block overflow-x-auto text-[11px] text-[var(--color-text-secondary)] break-all font-mono">{approvalAction.command}</code>
            </div>
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              {approvalAction.diagnostic
                ? 'This action is diagnostic only and is intended to inspect logs or resource state without changing the cluster.'
                : 'This action may modify cluster state. Review the command carefully before approval.'}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setApprovalAction(null)}
                className="ui-ghost-btn h-9 border border-[var(--color-border)] px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = approvalAction;
                  setApprovalAction(null);
                  void executeApprovedAction(pending.actionId, pending.label, pending.diagnostic);
                }}
                className="ui-primary-btn h-9 px-4 text-xs"
              >
                {approvalAction.diagnostic ? 'Approve & run diagnostic' : 'Approve & apply fix'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  clusters,
  selectedClusterId,
  onClusterChange,
  onDeleteCluster,
  onCreateWorkspace,
  themeMode,
  onThemeChange,
  onLogout,
  onClusterCreated,
  userProfile,
}: {
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: number | null;
  onWorkspaceChange: (workspaceId: number) => void;
  clusters: ClusterRecord[];
  selectedClusterId: number | null;
  onClusterChange: (clusterId: number | null) => void;
  onDeleteCluster: (clusterId: number) => Promise<void>;
  onCreateWorkspace: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onLogout: () => void;
  onClusterCreated: (cluster: ClusterRecord) => void;
  userProfile: UserProfile;
}) {
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [clusterModalOpen, setClusterModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const platformData = usePlatformData(selectedClusterId, selectedWorkspaceId);
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
          onOpenChat={() => setActiveSection('Chat')}
        />
      );
    }

    if (activeSection === 'Services') {
      return (
        <ServicesPage
          services={platformData.services}
          incidents={platformData.incidents}
          loading={platformData.loading}
        />
      );
    }

    if (activeSection === 'Chat') {
      return (
        <ChatPage
          incidents={platformData.incidents}
          actions={platformData.actions}
          selectedClusterId={selectedClusterId}
          selectedWorkspaceId={selectedWorkspaceId}
          clusters={clusters}
        />
      );
    }

    return (
      <OverviewPage
        services={platformData.services}
        incidents={platformData.incidents}
        actions={platformData.actions}
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
  const userName = userProfile.name;
  const userEmail = userProfile.email;
  const userAvatarUrl = userProfile.picture;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <Sidebar
        activeSection={activeSection}
        onSelect={(section: string) => setActiveSection(section as Section)}
        userLabel={userLabel}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
      />

      <main className={`min-h-screen px-6 py-6 transition-[margin-left] duration-200 ease-in-out lg:px-8 ${isSidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[220px]'}`}>
        <div className="mx-auto max-w-[1440px]">
          <Header
            pageTitle={pageMeta.title}
            pageSubtitle={pageMeta.subtitle}
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onWorkspaceChange={onWorkspaceChange}
            onCreateWorkspace={onCreateWorkspace}
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onClusterChange={onClusterChange}
            onDeleteCluster={onDeleteCluster}
            onConnectCluster={() => setClusterModalOpen(true)}
            userName={userName}
            userEmail={userEmail}
            userAvatarUrl={userAvatarUrl}
            themeMode={themeMode}
            onThemeChange={onThemeChange}
            onLogout={onLogout}
          />
          <section className="mb-6 space-y-4">
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
            </div>
          </section>

          <div className="space-y-6">
            {content}
          </div>

          {clusterModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/30 px-4 backdrop-blur-sm">
              <div className="ui-card max-h-[92vh] w-full max-w-4xl overflow-y-auto p-4 md:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Connect Cluster</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Validate access and connect a cluster to this workspace.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClusterModalOpen(false)}
                    className="ui-ghost-btn h-9 border border-[var(--color-border)] px-3"
                  >
                    Close
                  </button>
                </div>

                <ClusterOnboardingWizard
                  workspaces={workspaces}
                  selectedWorkspaceId={selectedWorkspaceId}
                  onWorkspaceChange={onWorkspaceChange}
                  onClusterCreated={(cluster: ClusterRecord) => {
                    onClusterCreated(cluster);
                    setClusterModalOpen(false);
                  }}
                />
              </div>
            </div>
          ) : null}
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
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: '',
    email: '',
    picture: '',
  });
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

  const loadUserProfile = async (tokenOverride?: string) => {
    const token = tokenOverride ?? getStoredAccessToken();
    if (!token) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/auth/me?token=${encodeURIComponent(token)}`);
    if (!response.ok) {
      return;
    }

    const profile = await response.json() as { name?: string; email?: string; picture?: string };
    const nextProfile: UserProfile = {
      name: profile.name?.trim() || '',
      email: profile.email?.trim() || '',
      picture: profile.picture?.trim() || '',
    };

    setUserProfile(nextProfile);
    localStorage.setItem('user_name', nextProfile.name);
    localStorage.setItem('user_email', nextProfile.email);
    localStorage.setItem('user_avatar', nextProfile.picture);
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
        await Promise.all([loadWorkspaces(), loadUserProfile(token)]);
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
    await Promise.all([loadWorkspaces(), loadUserProfile(data.access_token)]);
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
    await Promise.all([loadWorkspaces(), loadUserProfile(data.access_token)]);
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

  const handleDeleteCluster = async (clusterId: number) => {
    const response = await fetch(`${API_BASE_URL}/clusters/${clusterId}`, {
      method: 'DELETE',
      headers: getAuthenticatedHeaders(),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ detail: 'Failed to delete cluster.' }));
      throw new Error((data as { detail?: string }).detail ?? 'Failed to delete cluster.');
    }

    setClusters((current) => {
      const remaining = current.filter((cluster) => cluster.id !== clusterId);
      if (selectedClusterId === clusterId) {
        const nextClusterId = remaining[0]?.id ?? null;
        setSelectedClusterId(nextClusterId);
        if (nextClusterId) {
          localStorage.setItem('cluster_id', String(nextClusterId));
        } else {
          localStorage.removeItem('cluster_id');
        }
      }
      return remaining;
    });
  };

  const handleLogout = () => {
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'access_token=; path=/; max-age=0';
    localStorage.removeItem('access_token');
    localStorage.removeItem('workspace_id');
    localStorage.removeItem('workspace_name');
    localStorage.removeItem('cluster_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_avatar');
    setIsAuthenticated(false);
    setWorkspaces([]);
    setSelectedWorkspaceId(null);
    setClusters([]);
    setSelectedClusterId(null);
    setUserProfile({
      name: '',
      email: '',
      picture: '',
    });
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
                onDeleteCluster={handleDeleteCluster}
                onCreateWorkspace={() => setWorkspaceModalOpen(true)}
                themeMode={themeMode}
                onThemeChange={setThemeMode}
                onLogout={handleLogout}
                onClusterCreated={handleClusterCreated}
                userProfile={userProfile}
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
