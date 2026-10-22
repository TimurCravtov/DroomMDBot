import type { Arrival, Stop } from '../api';
import { TYPE_BADGE } from './typeStyles';

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
    <div className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
      <div className="mb-2 flex items-start gap-2">
        <h2 className="text-base font-semibold leading-tight">{stop.name}</h2>
        <button
          aria-label="Close"
          className="ml-auto rounded-full px-2 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {!arrivals ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : arrivals.length === 0 ? (
        <p className="text-sm text-slate-500">No vehicles serve this stop.</p>
      ) : (
        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
          {arrivals.slice(0, 8).map((a) => (
            <li key={a.vehicleId} className="flex items-center gap-3 py-2">
              <span className="w-10 text-lg font-bold">{a.routeNumber}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[a.type]}`}>
                {a.type}
              </span>
              <span className="ml-auto font-medium tabular-nums">{formatEta(a.etaSeconds)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
