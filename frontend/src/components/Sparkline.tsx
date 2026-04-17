type SparklineProps = {
  values: number[];
  color?: string;
};

function Sparkline({ values, color = 'bg-brand-600' }: SparklineProps) {
  const max = Math.max(...values, 1);

  return (
    <div className="flex h-10 items-end gap-1">
      {values.map((value, index) => (
        <div
          key={index}
          className={`h-full rounded-full ${color}`}
          style={{ flex: 1, height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default Sparkline;
