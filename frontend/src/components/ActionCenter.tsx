import { useMemo, useState } from 'react';

type Action = {
  id: string;
  title: string;
  description: string;
  risk: 'High' | 'Medium' | 'Low';
  impact: string;
};

type PendingAction = Action & {
  executed: boolean;
  result?: 'success' | 'failure';
};

type ConfirmationState = {
  action: PendingAction | null;
  mode: 'apply' | 'simulate';
  open: boolean;
};

const actions: Action[] = [
  {
    id: 'restart-pod',
    title: 'Restart Pod',
    description: 'Recycle the affected pod instance to restore application health quickly.',
    risk: 'Medium',
    impact: 'Restarts a single pod with minimal service disruption.',
  },
  {
    id: 'rollout-restart',
    title: 'Rollout Restart Deployment',
    description: 'Trigger a deployment restart to refresh all pods and clear transient failures.',
    risk: 'High',
    impact: 'Recycles deployment pods and may briefly increase traffic load.',
  },
  {
    id: 'scale-deployment',
    title: 'Scale Deployment',
    description: 'Increase replica count to absorb traffic spikes and reduce latency.',
    risk: 'Low',
    impact: 'Adds capacity while preserving current release state.',
  },
];

function riskStyles(risk: Action['risk']) {
  if (risk === 'High') return 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200';
  if (risk === 'Medium') return 'bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200';
  return 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
}

function ActionCenter() {
  const [pendingActions, setPendingActions] = useState<PendingAction[]>(
    actions.map((action) => ({ ...action, executed: false })),
  );
  const [confirmation, setConfirmation] = useState<ConfirmationState>({ action: null, mode: 'apply', open: false });
  const [loadingAction, setLoadingAction] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const currentAction = confirmation.action;
  const confirmTitle = confirmation.mode === 'apply' ? 'Apply Fix' : 'Simulate First';
  const confirmLabel = confirmation.mode === 'apply' ? 'This action will execute the remediation.' : 'This action will simulate the planned remediation.';

  const handleAction = (actionId: string, mode: 'apply' | 'simulate') => {
    const action = pendingActions.find((item) => item.id === actionId);
    if (!action) return;
    setConfirmation({ action, mode, open: true });
  };

  const executeConfirmed = () => {
    if (!currentAction) return;
    setLoadingAction(true);
    setConfirmation((state) => ({ ...state, open: false }));

    window.setTimeout(() => {
      const success = Math.random() > 0.12;
      setPendingActions((previous) =>
        previous.map((item) =>
          item.id === currentAction.id
            ? { ...item, executed: true, result: success ? 'success' : 'failure' }
            : item,
        ),
      );
      setToast({
        type: success ? 'success' : 'error',
        message: success
          ? `${currentAction.title} completed successfully.`
          : `${currentAction.title} failed. Please review the log and retry carefully.`,
      });
      setLoadingAction(false);
      window.setTimeout(() => setToast(null), 3500);
    }, 1400);
  };

  const availableActions = useMemo(
    () => pendingActions.filter((item) => !item.executed),
    [pendingActions],
  );

  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-950/85">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Action center</p>
          <h3 className="mt-3 text-xl font-semibold text-slate-950 dark:text-slate-50">Remediation actions</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Execute verified fixes with safety controls and audit-ready confirmation.</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">Safe control</span>
      </div>

      <div className="mt-6 space-y-4">
        {pendingActions.map((action) => (
          <div
            key={action.id}
            className="rounded-[1.75rem] border border-slate-200/70 bg-slate-50 p-5 shadow-sm transition hover:border-brand-300 dark:border-slate-700/70 dark:bg-slate-900/70"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">⚡</div>
                  <div>
                    <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">{action.title}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{action.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${riskStyles(action.risk)}`}>{action.risk} risk</span>
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Impact: {action.impact}</span>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                <button
                  type="button"
                  onClick={() => handleAction(action.id, 'simulate')}
                  disabled={action.executed || loadingAction}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  Simulate first
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(action.id, 'apply')}
                  disabled={action.executed || loadingAction}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply fix
                </button>
              </div>
            </div>
            {action.executed && action.result && (
              <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {action.result === 'success'
                  ? 'Action completed successfully. No further user steps required.'
                  : 'Execution failed. Review the incident logs before retrying.'}
              </div>
            )}
          </div>
        ))}

        {availableActions.length === 0 && (
          <div className="rounded-[1.75rem] bg-slate-50 p-5 text-center text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
            All suggested remediation actions have been executed.
          </div>
        )}
      </div>

      {confirmation.open && currentAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-700/80 dark:bg-slate-950/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Confirm action</p>
                <h4 className="mt-3 text-xl font-semibold text-slate-950 dark:text-slate-50">{confirmTitle}</h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmation({ action: null, mode: 'apply', open: false })}
                className="rounded-full border border-slate-200 bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                ×
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{confirmLabel}</p>
            <div className="mt-5 rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/80">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{currentAction.title}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{currentAction.description}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${riskStyles(currentAction.risk)}`}>{currentAction.risk} risk</span>
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Impact: {currentAction.impact}</span>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmation({ action: null, mode: 'apply', open: false })}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmed}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Confirm {confirmation.mode === 'apply' ? 'Execute' : 'Simulate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-slate-100">
              <span className={toast.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}>{toast.type === 'success' ? '✔' : '⚠'}</span>
              <span>{toast.message}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} className="text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100">Dismiss</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default ActionCenter;
