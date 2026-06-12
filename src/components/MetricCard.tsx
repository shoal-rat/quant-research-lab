import { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  hint,
  children
}: {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
      {children}
    </div>
  );
}
