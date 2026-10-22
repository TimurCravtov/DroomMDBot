import type { TransportType } from '../api';
import { TypeIcon, TYPE_LABEL } from './TypeBadge';
import { hoverRow, mutedText } from './ui';

export const TRANSPORT_TYPES: TransportType[] = ['trolleybus', 'bus', 'minibus'];

interface Props {
  value: TransportType | null;
  onChange: (type: TransportType | null) => void;
  /** Types with no matching routes are disabled. Omit to enable all. */
  available?: ReadonlySet<TransportType>;
  showLabels?: boolean;
  className?: string;
}

/** Row of "All / trolleybus / bus / minibus" toggle pills. */
export function TypeFilter({ value, onChange, available, showLabels = false, className = '' }: Props) {
  return (
    <div role="group" aria-label="Vehicle type" className={`flex gap-1.5 ${className}`}>
      {[null, ...TRANSPORT_TYPES].map((t) => {
        const disabled = t !== null && available !== undefined && !available.has(t);
        return (
          <button
            key={t ?? 'all'}
            type="button"
            aria-pressed={t === value}
            disabled={disabled}
            title={t ? TYPE_LABEL[t] : 'All types'}
            onClick={() => onChange(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm disabled:opacity-40 ${
              t === value
                ? 'bg-ink-900 font-semibold text-white dark:bg-white dark:text-ink-900'
                : `${mutedText} ${disabled ? '' : hoverRow}`
            }`}
          >
            {t ? <TypeIcon type={t} className="h-5 w-5" /> : 'All'}
            {t && showLabels && <span>{TYPE_LABEL[t]}</span>}
          </button>
        );
      })}
    </div>
  );
}
