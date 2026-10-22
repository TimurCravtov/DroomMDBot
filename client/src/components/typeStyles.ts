import type { TransportType } from '../api';

export const TYPE_COLOR: Record<TransportType, string> = {
  trolleybus: '#0284c7',
  bus: '#059669',
  minibus: '#d97706',
};

export const TYPE_BADGE: Record<TransportType, string> = {
  trolleybus: 'bg-sky-100 text-sky-800',
  bus: 'bg-emerald-100 text-emerald-800',
  minibus: 'bg-amber-100 text-amber-800',
};
