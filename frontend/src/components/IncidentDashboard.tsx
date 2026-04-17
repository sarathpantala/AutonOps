import { useEffect, useMemo, useState } from 'react';
import SkeletonLoader from './SkeletonLoader';
import IncidentDetailsPanel from './IncidentDetailsPanel';
import { API_BASE_URL } from '../lib/api';

type ApiIncident = {
  id: number;
  title: string;
  description?: string | null;
  status: 'open' | 'resolved' | 'acknowledged';
  service_id: number;
  created_at: string;
  updated_at?: string | null;
};

type ApiService = {
  id: number;
  name: string;
};

export type Incident = {
  id: string;
  service: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Resolved';
  detected: string;
  resource: string;
  cluster: string;
  namespace: string;
  summary: string;
  rawStatus: 'open' | 'resolved' | 'acknowledged';
};
const severities = ['All severities', 'Critical', 'High', 'Medium', 'Low'];

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function deriveSeverity(incident: ApiIncident): Incident['severity'] {
  const text = `${incident.title} ${incident.description ?? ''}`.toLowerCase();
  if (/(critical|outage|sev1|p1|down)/.test(text)) return 'Critical';
  if (/(latency|memory|cpu|error|timeout)/.test(text) || incident.status === 'open') return 'High';
  if (incident.status === 'acknowledged') return 'Medium';
  if (incident.status === 'resolved') return 'Low';
  return 'Medium';
}

function getSeverityStyles(severity: Incident['severity']) {
  switch (severity) {
    case 'Critical':
      return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200';
    case 'High':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-200';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200';
    case 'Low':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }
}

function getStatusStyles(status: Incident['status']) {
  return status === 'Active'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
}

function IncidentDashboard() {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [serviceFilter, setServiceFilter] = useState('All services');
  const [severityFilter, setSeverityFilter] = useState(severities[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceIncidents, setSourceIncidents] = useState<ApiIncident[]>([]);
  const [sourceServices, setSourceServices] = useState<ApiService[]>([]);

  const loadIncidents = async () => {
    setLoading(true);
    setError('');
    try {
      const [incidentsResponse, servicesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/incidents/`),
        fetch(`${API_BASE_URL}/services/`),
      ]);

      if (!incidentsResponse.ok || !servicesResponse.ok) {
        throw new Error('Failed to load incident data');
      }

      const [incidentsData, servicesData] = await Promise.all([
        incidentsResponse.json() as Promise<ApiIncident[]>,
        servicesResponse.json() as Promise<ApiService[]>,
      ]);

      setSourceIncidents(incidentsData);
      setSourceServices(servicesData);
    } catch (err) {
      setError('Could not load incidents from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
  }, []);

  const servicesById = useMemo(() => {
    const map = new Map<number, string>();
    sourceServices.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [sourceServices]);

  const incidentsView = useMemo<Incident[]>(
    () =>
      sourceIncidents.map((incident) => {
        const serviceName = servicesById.get(incident.service_id) ?? `service-${incident.service_id}`;
        return {
          id: `inc-${incident.id}`,
          service: serviceName,
          severity: deriveSeverity(incident),
          status: incident.status === 'resolved' ? 'Resolved' : 'Active',
          detected: formatRelativeTime(incident.created_at),
          resource: `Service/${serviceName}`,
          cluster: 'N/A',
          namespace: 'N/A',
          summary: incident.description?.trim() || incident.title,
          rawStatus: incident.status,
        };
      }),
    [sourceIncidents, servicesById],
  );

  const serviceOptions = useMemo(() => {
    const unique = Array.from(new Set(incidentsView.map((incident) => incident.service)));
    return ['All services', ...unique];
  }, [incidentsView]);

  const incidents = useMemo(() => {
    return incidentsView.filter((incident) => {
      const matchesService = serviceFilter === 'All services' || incident.service === serviceFilter;
      const matchesSeverity = severityFilter === 'All severities' || incident.severity === severityFilter;
      const matchesSearch = incident.service.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesService && matchesSeverity && matchesSearch;
    });
  }, [incidentsView, serviceFilter, severityFilter, searchQuery]);

  const activeCount = incidentsView.filter((incident) => incident.status === 'Active').length;
  const resolvedCount = incidentsView.filter((incident) => incident.status === 'Resolved').length;
  const acknowledgedCount = incidentsView.filter((incident) => incident.rawStatus === 'acknowledged').length;

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/85">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Incident dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">Active incidents</h1>
            <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">Investigate current reliability issues with filterable incident intelligence and AI context.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void loadIncidents();
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Refresh incidents
            </button>
            <span className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{activeCount} active issues</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/85">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950/60">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total incidents</p>
              <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-slate-100">{incidentsView.length}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950/60">
              <p className="text-sm text-slate-500 dark:text-slate-400">Active</p>
              <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-slate-100">{activeCount}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950/60">
              <p className="text-sm text-slate-500 dark:text-slate-400">Acknowledged</p>
              <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-slate-100">{acknowledgedCount}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950/60">
              <p className="text-sm text-slate-500 dark:text-slate-400">Resolved</p>
              <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-slate-100">{resolvedCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/85">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Filters</p>
          <div className="mt-5 grid gap-4">
            <select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {serviceOptions.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {severities.map((severity) => (
                <option key={severity} value={severity}>{severity}</option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Search by service name"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="space-y-4">
          {error && (
            <div className="rounded-[2rem] border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/85">
                <SkeletonLoader />
              </div>
            ))
          ) : incidents.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">No active incidents</p>
              <p className="mt-4 text-xl font-semibold text-slate-950 dark:text-slate-100">Everything looks quiet for now</p>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Try adjusting your filters or refresh to load the latest issue data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 rounded-[2rem] bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-950/60 dark:text-slate-400 sm:grid-cols-[1.3fr_0.8fr_1.1fr_0.5fr]">
                <span className="font-semibold uppercase tracking-[0.18em]">Service</span>
                <span className="font-semibold uppercase tracking-[0.18em]">Severity</span>
                <span className="font-semibold uppercase tracking-[0.18em]">Detected / resource</span>
                <span className="font-semibold uppercase tracking-[0.18em]">Status</span>
              </div>
              {incidents.map((incident) => (
                <button
                  type="button"
                  key={incident.id}
                  onClick={() => setSelectedIncident(incident)}
                  className="group w-full rounded-[2rem] border border-slate-200/70 bg-white p-5 text-left shadow-soft transition hover:border-brand-300 hover:bg-brand-50/70 dark:border-slate-700/70 dark:bg-slate-900/85 dark:hover:border-brand-500/30 dark:hover:bg-slate-800"
                >
                  <div className="grid gap-4 sm:grid-cols-[1.3fr_0.8fr_1.1fr_0.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{incident.service}</p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{incident.cluster} · {incident.namespace}</p>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getSeverityStyles(incident.severity)}`}>{incident.severity}</span>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{incident.detected}</p>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{incident.resource}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusStyles(incident.status)}`}>{incident.status}</span>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{incident.summary}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <IncidentDetailsPanel incident={selectedIncident} onClose={() => setSelectedIncident(null)} />
      </div>
    </div>
  );
}

export default IncidentDashboard;
