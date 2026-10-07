import type { FC } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

interface SchedulerAlertBannerProps {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
}

const CONFIG = {
  success: {
    panel: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-700',
    title: 'text-emerald-900',
    text: 'text-emerald-700',
    Icon: CheckCircle2,
    label: 'Opération réussie',
  },
  error: {
    panel: 'border-rose-200 bg-rose-50/70',
    icon: 'bg-rose-100 text-rose-700',
    title: 'text-rose-900',
    text: 'text-rose-700',
    Icon: AlertCircle,
    label: 'Action requise',
  },
  info: {
    panel: 'border-sky-200 bg-sky-50/70',
    icon: 'bg-sky-100 text-sky-700',
    title: 'text-sky-900',
    text: 'text-sky-700',
    Icon: Info,
    label: 'Information opérationnelle',
  },
} as const;

export const SchedulerAlertBanner: FC<SchedulerAlertBannerProps> = ({
  type,
  message,
  onClose,
}) => {
  const config = CONFIG[type];
  const Icon = config.Icon;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${config.panel}`} role="alert">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${config.icon}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${config.title}`}>{config.label}</p>
        <p className={`mt-0.5 text-xs leading-5 ${config.text}`}>{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        aria-label="Fermer le message"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default SchedulerAlertBanner;
