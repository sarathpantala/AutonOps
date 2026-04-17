import SkeletonLoader from './SkeletonLoader';

type PanelCardProps = {
  title: string;
  subtitle: string;
  loading?: boolean;
};

function PanelCard({ title, subtitle, loading }: PanelCardProps) {
  return (
    <div className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/85">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{subtitle}</p>
          <h2 className="mt-3 text-xl font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
        </div>
        <div className="rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Live</div>
      </div>
      {loading ? (
        <div className="mt-6 space-y-4">
          <SkeletonLoader />
          <SkeletonLoader />
          <SkeletonLoader />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/60">
            <p className="text-sm text-slate-500 dark:text-slate-400">Latency trend</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-100">65 ms</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/60">
              <p className="text-sm text-slate-500 dark:text-slate-400">Alerts</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-100">7 opened</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/60">
              <p className="text-sm text-slate-500 dark:text-slate-400">Anomalies</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-100">3 flagged</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelCard;
