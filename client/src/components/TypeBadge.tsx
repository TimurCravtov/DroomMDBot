import type { ComponentType } from 'react';
import { PiBus, PiTram, PiVan } from 'react-icons/pi';
import type { TransportType } from '../api';
import { TYPE_BADGE } from './typeStyles';

export const TYPE_ICON: Record<TransportType, ComponentType<{ className?: string }>> = {
  trolleybus: PiTram,
  bus: PiBus,
  minibus: PiVan,
};

export const TYPE_LABEL: Record<TransportType, string> = {
  trolleybus: 'Trolleybus',
  bus: 'Bus',
  minibus: 'Minibus',
};

export function TypeIcon({ type, className = 'h-4 w-4' }: { type: TransportType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon className={className} />;
}

/** Colored pill with the vehicle icon and name. */
export function TypeBadge({ type }: { type: TransportType }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[type]}`}
    >
      <TypeIcon type={type} className="h-3.5 w-3.5" />
      {TYPE_LABEL[type]}
    </span>
  );
}
