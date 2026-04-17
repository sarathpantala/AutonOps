type AIAnalysisPanelProps = {
  title: string;
  summary: string;
  recommendation?: string;
  tone?: 'healthy' | 'warning' | 'critical';
};

function AIAnalysisPanel({ title, summary, recommendation, tone = 'healthy' }: AIAnalysisPanelProps) {
  const accentClass = tone === 'critical'
    ? 'bg-red-500/12 text-red-300'
    : tone === 'warning'
      ? 'bg-amber-500/12 text-amber-200'
      : 'bg-emerald-500/12 text-emerald-200';

  return (
    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_16px_36px_rgba(8,15,35,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-secondary)]">AI insight</p>
          <h3 className="mt-3 text-xl font-semibold text-[var(--color-text-primary)]">{title}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${accentClass}`}>{tone}</span>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl bg-[var(--color-surface-elevated)] p-5">
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{summary}</p>
        </div>
        {recommendation ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Recommended action</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-text-primary)]">{recommendation}</p>
          </div>
        ) : null}

        <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(91,124,255,0.14),rgba(124,91,255,0.14))] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">AutonOps note</p>
          <p className="mt-3 text-sm text-[var(--color-text-primary)]">Insights become more precise as workspace-scoped clusters are onboarded and telemetry starts flowing.</p>
        </div>
      </div>
    </section>
  );
}

export default AIAnalysisPanel;
