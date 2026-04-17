import { useEffect, useMemo, useState } from 'react';
import SkeletonLoader from './SkeletonLoader';

const API_BASE_URL = 'http://localhost:8000';

type ApiIncident = {
  id: number;
  title: string;
  description?: string | null;
  status: 'open' | 'resolved' | 'acknowledged';
  service_id: number;
  created_at: string;
};

type ApiService = {
  id: number;
  name: string;
};

type ApiAction = {
  id: number;
  incident_id: number;
  description: string;
  executed_at: string;
};

export type HistoricalIncident = {
  id: string;
  service: string;
  rootCause: string;
  actionTaken: string;
  outcome: 'Success' | 'Failure';
  timestamp: string;
  patternCount?: number;
};

function countRecurringIncidents(current: ApiIncident, allIncidents: ApiIncident[]): number {
  return allIncidents.filter(
    (incident) => incident.service_id === current.service_id && incident.title === current.title && incident.id !== current.id,
  ).length;
}

function IncidentHistory() {
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [actions, setActions] = useState<ApiAction[]>([]);
  const [error, setError] = useState('');
  const [selectedService, setSelectedService] = useState<string>('All');
  const [timeRange, setTimeRange] = useState<string>('Last 30 days');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const [incidentsResponse, servicesResponse, actionsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/incidents/`),
          fetch(`${API_BASE_URL}/services/`),
          fetch(`${API_BASE_URL}/actions/`),
        ]);

        if (!incidentsResponse.ok || !servicesResponse.ok || !actionsResponse.ok) {
          throw new Error('Failed to fetch history');
        }

        const [incidentsData, servicesData, actionsData] = await Promise.all([
          incidentsResponse.json() as Promise<ApiIncident[]>,
          servicesResponse.json() as Promise<ApiService[]>,
          actionsResponse.json() as Promise<ApiAction[]>,
        ]);

        setIncidents(incidentsData);
        setServices(servicesData);
        setActions(actionsData);
      } catch (err) {
        setError('Could not load incident history from backend.');
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, []);

  const serviceNameById = useMemo(() => {
    const map = new Map<number, string>();
    services.forEach((service) => map.set(service.id, service.name));
    return map;
  }, [services]);

  const latestActionByIncident = useMemo(() => {
    const map = new Map<number, ApiAction>();
    actions.forEach((action) => {
      const existing = map.get(action.incident_id);
      if (!existing || new Date(action.executed_at).getTime() > new Date(existing.executed_at).getTime()) {
        map.set(action.incident_id, action);
      }
    });
    return map;
  }, [actions]);

  const historicalIncidents = useMemo<HistoricalIncident[]>(() => {
    return incidents.map((incident) => {
      const latestAction = latestActionByIncident.get(incident.id);
      return {
        id: `hist-${incident.id}`,
        service: serviceNameById.get(incident.service_id) ?? `service-${incident.service_id}`,
        rootCause: incident.description?.trim() || incident.title,
        actionTaken: latestAction?.description ?? 'No action has been recorded for this incident.',
        outcome: incident.status === 'resolved' ? 'Success' : 'Failure',
        timestamp: incident.created_at,
        patternCount: countRecurringIncidents(incident, incidents),
      };
    });
  }, [incidents, latestActionByIncident, serviceNameById]);

  const serviceOptions = useMemo(() => {
    return Array.from(new Set(historicalIncidents.map((incident) => incident.service)));
  }, [historicalIncidents]);

  const filteredIncidents = useMemo(() => {
    let filtered = historicalIncidents;

    if (selectedService !== 'All') {
      filtered = filtered.filter(inc => inc.service === selectedService);
    }

    const now = new Date();
    const days = timeRange === 'Last 7 days' ? 7 : timeRange === 'Last 30 days' ? 30 : 90;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(inc => new Date(inc.timestamp) >= cutoff);

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [historicalIncidents, selectedService, timeRange]);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-100">Incident History</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Learn from past incidents to prevent future occurrences
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Service:</span>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="All">All Services</option>
              {serviceOptions.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Time:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="Last 7 days">Last 7 days</option>
              <option value="Last 30 days">Last 30 days</option>
              <option value="Last 90 days">Last 90 days</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader />
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
          {filteredIncidents.map((incident) => (
            <div
              key={incident.id}
              className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/85"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      incident.outcome === 'Success'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                    }`}>
                      {incident.outcome === 'Success' ? '✅' : '❌'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-950 dark:text-slate-100">
                        {incident.service}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {formatDate(incident.timestamp)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Root Cause
                      </p>
                      <p className="mt-1 text-sm text-slate-950 dark:text-slate-100">
                        {incident.rootCause}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Action Taken
                      </p>
                      <p className="mt-1 text-sm text-slate-950 dark:text-slate-100">
                        {incident.actionTaken}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Outcome
                      </p>
                      <p className="mt-1 text-sm text-slate-950 dark:text-slate-100">
                        {incident.outcome}
                      </p>
                    </div>
                  </div>

                  {incident.patternCount && incident.patternCount > 0 && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
                      <span className="text-lg">🧠</span>
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Pattern Recognition:</strong> Similar issue seen {incident.patternCount} time{incident.patternCount > 1 ? 's' : ''} before.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredIncidents.length === 0 && (
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-10 text-center shadow-soft dark:border-slate-700/70 dark:bg-slate-900/85">
              <span className="text-4xl">📚</span>
              <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-slate-100">No incidents found</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Try adjusting your filters or check back once incidents are created.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default IncidentHistory;