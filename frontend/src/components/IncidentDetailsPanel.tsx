import type { Incident } from './IncidentDashboard';

type IncidentDetailsPanelProps = {
  incident: Incident | null;
  onClose: () => void;
};


function IncidentDetailsPanel({ incident, onClose }: IncidentDetailsPanelProps) {
  const riskLabel = incident?.severity === 'Critical' ? 'High' : incident?.severity === 'High' ? 'Medium' : 'Low';
  const requiresConfirmation = riskLabel === 'High';
  const severityStyle = incident?.severity === 'Critical'
    ? 'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
    : incident?.severity === 'High'
      ? 'bg-orange-500/12 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200'
      : 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200';

  const confidence = incident?.severity === 'Critical' ? 92 : incident?.severity === 'High' ? 84 : 74;
  const primaryAction = incident?.severity === 'Critical'
    ? 'Apply Immediate Mitigation'
    : incident?.severity === 'High'
      ? 'Run Safe Remediation'
      : 'Acknowledge and Monitor';

  const secondaryActions = incident?.severity === 'Critical'
    ? ['Open Rollback Plan', 'Escalate to On-call']
    : incident?.severity === 'High'
      ? ['Inspect Service Logs', 'Scale Service']
      : ['Create Follow-up Task', 'Mark for Observation'];

  const handlePrimaryAction = () => {
    if (requiresConfirmation) {
      const confirmed = window.confirm('This is a high-risk remediation action. Do you want to proceed?');
      if (!confirmed) return;
    }
  };

  if (!incident) {
    return (
      <aside className="glass-panel col-span-full lg:col-auto lg:w-[420px]">
        <div className="rounded-[1.25rem] bg-slate-50 p-6 text-center dark:bg-slate-900/80">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Control panel</p>
          <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-slate-100">Select an incident</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Actions and response controls appear here.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="glass-panel col-span-full lg:col-auto lg:w-[420px]">
      {/* 1. Incident header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Incident control panel</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{incident.service}</h2>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityStyle}`}>{incident.severity}</span>
            <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">{incident.status}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
          ×
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {/* 2. Root cause */}
        <section className="rounded-[1rem] bg-rose-500/10 p-4 dark:bg-rose-500/12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700 dark:text-rose-200">Root cause</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{incident.summary}</p>
        </section>

        {/* 3. Confidence score */}
        <section className="rounded-[1rem] bg-slate-50 p-4 dark:bg-slate-900/70">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Confidence score</p>
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{confidence}%</p>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${confidence}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Risk: {riskLabel}</p>
        </section>

        {/* 4. Primary action */}
        <section>
          <button
            type="button"
            onClick={handlePrimaryAction}
            className="h-14 w-full rounded-[10px] bg-brand-600 px-4 text-base font-semibold text-white shadow-soft transition hover:bg-brand-700"
          >
            {primaryAction}
          </button>
          {requiresConfirmation && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">High-risk actions require confirmation before execution.</p>
          )}
        </section>

        {/* 5. Secondary actions */}
        <section className="rounded-[1rem] bg-slate-50 p-4 dark:bg-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Secondary actions</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {secondaryActions.map((action) => (
              <button
                key={action}
                type="button"
                className="h-10 rounded-[10px] bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {action}
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-2 rounded-[1rem] bg-slate-50 p-4 dark:bg-slate-900/70">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Resource</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{incident.resource}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Detected</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{incident.detected}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Scope</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{incident.cluster} · {incident.namespace}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default IncidentDetailsPanel;
