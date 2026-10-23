import type { TransportType } from '../api';
import { useI18n } from '../i18n';
import { TypeIcon } from './TypeBadge';
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
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t('filter.vehicleType')} className={`flex gap-1.5 ${className}`}>
      {[null, ...TRANSPORT_TYPES].map((type) => {
        const disabled = type !== null && available !== undefined && !available.has(type);
        return (
          <button
            key={type ?? 'all'}
            type="button"
            aria-pressed={type === value}
            disabled={disabled}
            title={type ? t(`type.${type}`) : t('filter.allTypes')}
            onClick={() => onChange(type)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm disabled:opacity-40 ${
              type === value
                ? 'bg-ink-900 font-semibold text-white dark:bg-white dark:text-ink-900'
                : `${mutedText} ${disabled ? '' : hoverRow}`
            }`}
          >
            {type ? <TypeIcon type={type} className="h-5 w-5" /> : t('filter.all')}
            {type && showLabels && <span>{t(`type.${type}`)}</span>}
          </button>
        );
      })}
    </div>
  );
}
