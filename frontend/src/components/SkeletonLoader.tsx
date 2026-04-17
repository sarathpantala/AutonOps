function SkeletonLoader() {
  return (
    <div className="animate-pulse rounded-3xl bg-slate-100 p-5 dark:bg-slate-800">
      <div className="h-4 w-3/5 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 grid gap-3">
        <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-4/5 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

export default SkeletonLoader;
