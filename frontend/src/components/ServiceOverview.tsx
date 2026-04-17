import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../lib/api';

type ApiService = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
};

type ApiIncident = {
  id: number;
  title: string;
  description?: string | null;
  status: 'open' | 'resolved' | 'acknowledged';
  service_id: number;
  created_at: string;
};

type ServiceItem = {
  id: string;
  serviceId: number;
  name: string;
  health: 'Healthy' | 'Degraded' | 'Critical';
  isActive: boolean;
  openIncidents: number;
  resolvedIncidents: number;
  description: string;
  cluster: 'Cluster A' | 'Cluster B';
  namespace: 'prod' | 'staging';
  incidents: { id: number; title: string; status: string; createdAt: string }[];
};

type IncidentCard = {
  id: number;
  serviceId: number;
  serviceName: string;
  severity: 'Critical' | 'High' | 'Medium';
  summary: string;
  status: 'open' | 'resolved' | 'acknowledged';
  cluster: 'Cluster A' | 'Cluster B';
};

const clusterOptions = ['All clusters', 'Cluster A', 'Cluster B'] as const;

const statusStyle = {
  Healthy: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  Degraded: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  Critical: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
};

const severityStyle = {
  Critical: 'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
  High: 'bg-orange-500/12 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200',
  Medium: 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
};

function deriveSeverity(incident: ApiIncident): IncidentCard['severity'] {
  const text = `${incident.title} ${incident.description ?? ''}`.toLowerCase();
  if (/(critical|outage|sev1|p1|down)/.test(text)) return 'Critical';
  if (incident.status === 'open') return 'High';
  return 'Medium';
}

function getServiceCluster(serviceId: number): IncidentCard['cluster'] {
  return serviceId % 2 === 0 ? 'Cluster B' : 'Cluster A';
}

function ServiceOverview() {
  const [clusterFilter, setClusterFilter] = useState<(typeof clusterOptions)[number]>('All clusters');
  const [services, setServices] = useState<ApiService[]>([]);
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fixLoadingId, setFixLoadingId] = useState<number | null>(null);
  const [fixMessage, setFixMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [servicesResponse, incidentsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/services/`),
        fetch(`${API_BASE_URL}/incidents/`),
      ]);

      if (!servicesResponse.ok || !incidentsResponse.ok) {
        throw new Error('Failed to load services');
      }

      const [servicesData, incidentsData] = await Promise.all([
        servicesResponse.json() as Promise<ApiService[]>,
        incidentsResponse.json() as Promise<ApiIncident[]>,
      ]);

      setServices(servicesData);
      setIncidents(incidentsData);
    } catch (err) {
      setError('Could not load services from backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const serviceItems = useMemo<ServiceItem[]>(() => {
    return services.map((service) => {
      const serviceIncidents = incidents
        .filter((incident) => incident.service_id === service.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const openIncidents = serviceIncidents.filter((incident) => incident.status !== 'resolved').length;
      const resolvedIncidents = serviceIncidents.filter((incident) => incident.status === 'resolved').length;

      let health: ServiceItem['health'] = 'Healthy';
      if (openIncidents >= 3) {
        health = 'Critical';
      } else if (openIncidents > 0) {
        health = 'Degraded';
      }

      return {
        id: `svc-${service.id}`,
        serviceId: service.id,
        name: service.name,
        health,
        isActive: service.is_active,
        openIncidents,
        resolvedIncidents,
        description: service.description?.trim() || 'No description available for this service.',
        cluster: getServiceCluster(service.id),
        namespace: service.id % 2 === 0 ? 'staging' : 'prod',
        incidents: serviceIncidents.map((incident) => ({
          id: incident.id,
          title: incident.title,
          status: incident.status,
          createdAt: incident.created_at,
        })),
      };
    });
  }, [services, incidents]);

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedServiceId && serviceItems.length > 0) {
      setSelectedServiceId(serviceItems[0].id);
    }
  }, [selectedServiceId, serviceItems]);

  const selectedService = useMemo(
    () => serviceItems.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, serviceItems],
  );

  const criticalIncidents = useMemo<IncidentCard[]>(() => {
    const mapped = incidents
      .filter((incident) => incident.status !== 'resolved')
      .map((incident) => {
        const service = services.find((svc) => svc.id === incident.service_id);
        return {
          id: incident.id,
          serviceId: incident.service_id,
          serviceName: service?.name ?? `service-${incident.service_id}`,
          severity: deriveSeverity(incident),
          summary: incident.description?.trim() || incident.title,
          status: incident.status,
          cluster: getServiceCluster(incident.service_id),
        };
      })
      .filter((incident) => incident.severity === 'Critical');

    return mapped;
  }, [incidents, services]);

  const visibleServices = useMemo(
    () => serviceItems.filter((service) => clusterFilter === 'All clusters' || service.cluster === clusterFilter),
    [clusterFilter, serviceItems],
  );

  const visibleCriticalIncidents = useMemo(
    () => criticalIncidents.filter((incident) => clusterFilter === 'All clusters' || incident.cluster === clusterFilter),
    [clusterFilter, criticalIncidents],
  );

  const totalOpenIncidents = serviceItems.reduce((count, service) => count + service.openIncidents, 0);

  const handleFixIssue = async (incident: IncidentCard) => {
    setFixLoadingId(incident.id);
    setFixMessage('');
    setSelectedServiceId(`svc-${incident.serviceId}`);

    try {
      const response = await fetch(`${API_BASE_URL}/actions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          incident_id: incident.id,
          type: 'manual',
          description: `Fix issue triggered from dashboard for ${incident.serviceName}`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger action');
      }

      setFixMessage(`Remediation started for ${incident.serviceName}.`);
    } catch (err) {
      setFixMessage(`Could not trigger fix for ${incident.serviceName}.`);
    } finally {
      setFixLoadingId(null);
      window.setTimeout(() => setFixMessage(''), 2800);
    }
  };

  return (
    <div className="space-y-7">
      {/* Top: cluster selector + refresh button */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Cluster</label>
          <select
            value={clusterFilter}
            onChange={(event) => setClusterFilter(event.target.value as (typeof clusterOptions)[number])}
            className="h-11 rounded-[10px] bg-white px-4 text-sm font-medium text-slate-900 shadow-soft outline-none focus:ring-2 focus:ring-brand-400 dark:bg-slate-900 dark:text-slate-100"
          >
            {clusterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadData();
          }}
          className="h-11 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"
        >
          Refresh
        </button>
      </section>

      {error && (
        <p className="rounded-[10px] bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</p>
      )}

      {fixMessage && (
        <p className="rounded-[10px] bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{fixMessage}</p>
      )}

      <div className="grid gap-8 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-8">
          {/* First section: Critical Incidents */}
          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Critical Incidents</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">Active issues requiring immediate action</h2>
            </div>

            {loading ? (
              <div className="rounded-[10px] bg-white p-4 text-sm text-slate-600 shadow-soft dark:bg-slate-900 dark:text-slate-300">Loading incidents...</div>
            ) : visibleCriticalIncidents.length === 0 ? (
              <div className="rounded-[10px] bg-white p-4 text-sm text-slate-600 shadow-soft dark:bg-slate-900 dark:text-slate-300">No critical incidents in this cluster.</div>
            ) : (
              <div className="space-y-3">
                {visibleCriticalIncidents.map((incident) => (
                  <article key={incident.id} className="rounded-[10px] bg-white p-4 shadow-soft dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-950 dark:text-slate-100">{incident.serviceName}</p>
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${severityStyle[incident.severity]}`}>{incident.severity}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleFixIssue(incident)}
                        disabled={fixLoadingId === incident.id}
                        className="h-10 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {fixLoadingId === incident.id ? 'Fixing...' : 'Fix issue'}
                      </button>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{incident.summary}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Second section: Services overview */}
          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Services Overview</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">Service health and incident pressure</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-sm text-slate-500 dark:text-slate-400">Open incidents</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">{totalOpenIncidents}</p>
              </div>
              <div className="rounded-[10px] bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-sm text-slate-500 dark:text-slate-400">Services</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">{visibleServices.length}</p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-[10px] bg-white p-4 text-sm text-slate-600 shadow-soft dark:bg-slate-900 dark:text-slate-300">Loading services...</div>
            ) : (
              <div className="space-y-2">
                {visibleServices.map((service) => (
                  <button
                    type="button"
                    key={service.id}
                    onClick={() => setSelectedServiceId(service.id)}
                    className="w-full rounded-[10px] bg-white p-4 text-left shadow-soft transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-950 dark:text-slate-100">{service.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{service.namespace} · {service.cluster}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[service.health]}`}>{service.health}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right panel: selected service details */}
        <aside className="space-y-4 rounded-[10px] bg-white p-5 shadow-soft dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Selected service</p>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">{selectedService?.name ?? 'None selected'}</h2>

          {selectedService ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Description</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedService.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[10px] bg-slate-50 p-3 dark:bg-slate-950/60">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mode</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-100">{selectedService.isActive ? 'Active' : 'Inactive'}</p>
                </div>
                <div className="rounded-[10px] bg-slate-50 p-3 dark:bg-slate-950/60">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Health</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-100">{selectedService.health}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Recent incidents</p>
                {selectedService.incidents.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No recent incidents.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selectedService.incidents.slice(0, 4).map((incident) => (
                      <li key={incident.id} className="rounded-[10px] bg-slate-50 p-3 dark:bg-slate-950/60">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{incident.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Status: {incident.status}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">Select a service to inspect details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default ServiceOverview;
