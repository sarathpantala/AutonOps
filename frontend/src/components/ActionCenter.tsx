import { useState } from 'react';

function ActionCenter() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-950/85">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Action center</p>
          <h3 className="mt-3 text-xl font-semibold text-slate-950 dark:text-slate-50">No static actions</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This panel no longer ships hardcoded remediation actions. Render live action data from the backend before enabling execution controls.</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-6 rounded-[1.75rem] bg-slate-50 p-5 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
        Replace this placeholder with backend-provided actions, approvals, and execution status when the component is reintroduced.
      </div>
    </section>
  );
}

export default ActionCenter;
