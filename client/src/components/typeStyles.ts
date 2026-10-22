import type { TransportType } from '../api';

export const TYPE_COLOR: Record<TransportType, string> = {
  trolleybus: '#e11d48',
  bus: '#059669',
  minibus: '#d97706',
};

export const TYPE_BADGE: Record<TransportType, string> = {
  trolleybus: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
  bus: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  minibus: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
};
