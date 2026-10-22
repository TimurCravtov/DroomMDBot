import { useState } from 'react';
import { TbCheck, TbRoute } from 'react-icons/tb';
import type { Route, TransportType } from '../api';
import { TypeBadge, TypeIcon, TYPE_LABEL } from './TypeBadge';
import { hoverRow, mutedText, roundButton, surface } from './ui';

interface Props {
  routes: Route[];
  selectedRouteId: string | null;
  /** null shows vehicles from every route again. */
  onSelect: (routeId: string | null) => void;
}

const TYPES: TransportType[] = ['trolleybus', 'bus', 'minibus'];

/** Button that opens a list of routes, filterable by vehicle type. */
export function RoutePicker({ routes, selectedRouteId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransportType | null>(null);

  const visible = routes.filter((r) => type === null || r.type === type);
  const choose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        aria-label="Select route"
        aria-expanded={open}
        title="Routes"
        className={roundButton}
        onClick={() => setOpen((o) => !o)}
      >
        <TbRoute className="h-6 w-6" />
      </button>

      {open && (
        <div
          className={`absolute bottom-12 left-0 flex h-[min(28rem,60vh)] w-72 flex-col overflow-hidden rounded-2xl shadow-lg ${surface}`}
        >
          <div className="flex gap-1.5 border-b border-ink-200 p-2 dark:border-ink-700">
            {[null, ...TYPES].map((t) => (
              <button
                key={t ?? 'all'}
                aria-pressed={t === type}
                title={t ? TYPE_LABEL[t] : 'All types'}
                onClick={() => setType(t)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-sm ${
                  t === type
                    ? 'bg-ink-900 font-semibold text-white dark:bg-white dark:text-ink-900'
                    : `${mutedText} ${hoverRow}`
                }`}
              >
                {t ? <TypeIcon type={t} className="h-5 w-5" /> : 'All'}
              </button>
            ))}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            <li>
              <button
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${hoverRow}`}
                onClick={() => choose(null)}
              >
                <span className={selectedRouteId === null ? 'font-semibold' : ''}>All routes</span>
                {selectedRouteId === null && <TbCheck className="h-4 w-4" />}
              </button>
            </li>
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${hoverRow}`}
                  onClick={() => choose(r.id)}
                >
                  <span className="w-9 text-lg font-bold">{r.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.name}</span>
                    <span className="mt-0.5 block">
                      <TypeBadge type={r.type} />
                    </span>
                  </span>
                  {r.id === selectedRouteId && <TbCheck className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className={`px-4 py-3 text-sm ${mutedText}`}>No routes of this type.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
