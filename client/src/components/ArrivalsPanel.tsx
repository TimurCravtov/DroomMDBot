import type { Arrival, Stop } from '../api';
import { useI18n, type Translate } from '../i18n';
import { RouteNumber } from './RouteColors';
import { TypeBadge } from './TypeBadge';
import { closeButton, hoverRow, mutedText, surface } from './ui';
import { TbX } from 'react-icons/tb';

interface Props {
  stop: Stop;
  arrivals: Arrival[] | undefined;
  error: Error | undefined;
  /** Routes currently shown on the map, to mark their rows. */
  selectedRouteIds: string[];
  /** A row was tapped: show (or hide again) that route on the map. */
  onSelectRoute: (routeId: string) => void;
  onClose: () => void;
}

const formatEta = (t: Translate, seconds: number) =>
  seconds < 60 ? t('time.lessThanMin') : t('time.min', { n: Math.round(seconds / 60) });

export function ArrivalsPanel({
  stop,
  arrivals,
  error,
  selectedRouteIds,
  onSelectRoute,
  onClose,
}: Props) {
  const { t } = useI18n();
  return (
    <div className={`rounded-2xl p-4 shadow-lg ${surface}`}>
      <div className="mb-2 flex items-start gap-2">
        <h2 className="text-base font-semibold leading-tight">{stop.name}</h2>
        <button
          aria-label={t('common.close')}
          className={`ml-auto ${closeButton}`}
          onClick={onClose}
        >
          <TbX className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{t('arrivals.error')}</p>}
      {!arrivals ? (
        <p className={`text-sm ${mutedText}`}>{t('common.loading')}</p>
      ) : arrivals.length === 0 ? (
        <p className={`text-sm ${mutedText}`}>{t('arrivals.none')}</p>
      ) : (
        <ul className="max-h-60 divide-y divide-ink-100 overflow-y-auto dark:divide-ink-700">
          {arrivals.slice(0, 8).map((a) => {
            const shown = selectedRouteIds.includes(a.routeId);
            return (
              <li key={a.vehicleId}>
                <button
                  aria-pressed={shown}
                  title={t('map.showRoute', { number: a.routeNumber })}
                  className={`flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left ${hoverRow} ${
                    shown ? 'bg-ink-100 dark:bg-ink-900' : ''
                  }`}
                  onClick={() => onSelectRoute(a.routeId)}
                >
                  <RouteNumber routeId={a.routeId} number={a.routeNumber} type={a.type} />
                  <TypeBadge type={a.type} />
                  <span className="ml-auto font-medium tabular-nums">
                    {formatEta(t, a.etaSeconds)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
