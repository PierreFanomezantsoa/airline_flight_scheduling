import type { FC, ReactNode } from 'react';

interface SchedulerKpiCardProps {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'success';
}

const TONES = {
  default: {
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    value: 'text-slate-950',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    value: 'text-amber-700',
  },
  success: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    value: 'text-emerald-700',
  },
} as const;

export const SchedulerKpiCard: FC<SchedulerKpiCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}) => {
  const styles = TONES[tone];

  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${styles.icon}`}>
          {icon}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <strong className={`text-3xl font-bold tabular-nums tracking-tight ${styles.value}`}>
          {value}
        </strong>
        <span className="pb-1 text-right text-[11px] font-medium leading-4 text-slate-400">
          {hint}
        </span>
      </div>
    </article>
  );
};

export default SchedulerKpiCard;
