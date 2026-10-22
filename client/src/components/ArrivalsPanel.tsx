import type { Arrival, Stop } from '../api';
import { TypeBadge } from './TypeBadge';
import { closeButton, mutedText, surface } from './ui';
import { TbX } from 'react-icons/tb';

interface Props {
  stop: Stop;
  arrivals: Arrival[] | undefined;
  error: Error | undefined;
  onClose: () => void;
}

const formatEta = (seconds: number) =>
  seconds < 60 ? '<1 min' : `${Math.round(seconds / 60)} min`;

export function ArrivalsPanel({ stop, arrivals, error, onClose }: Props) {
  return (
    <div className={`rounded-2xl p-4 shadow-lg ${surface}`}>
      <div className="mb-2 flex items-start gap-2">
        <h2 className="text-base font-semibold leading-tight">{stop.name}</h2>
        <button
          aria-label="Close"
          className={`ml-auto ${closeButton}`}
          onClick={onClose}
        >
          <TbX className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {!arrivals ? (
        <p className={`text-sm ${mutedText}`}>Loading…</p>
      ) : arrivals.length === 0 ? (
        <p className={`text-sm ${mutedText}`}>No vehicles serve this stop.</p>
      ) : (
        <ul className="max-h-60 divide-y divide-ink-100 overflow-y-auto dark:divide-ink-700">
          {arrivals.slice(0, 8).map((a) => (
            <li key={a.vehicleId} className="flex items-center gap-3 py-2">
              <span className="w-10 text-lg font-bold">{a.routeNumber}</span>
              <TypeBadge type={a.type} />
              <span className="ml-auto font-medium tabular-nums">{formatEta(a.etaSeconds)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
