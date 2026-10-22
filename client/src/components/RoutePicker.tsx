import { useEffect, useRef, useState } from 'react';
import { TbCheck, TbRoute } from 'react-icons/tb';
import type { Route, TransportType } from '../api';
import { RouteChecklistItems, toggleRoute } from './RouteChecklist';
import { TypeFilter } from './TypeFilter';
import { hoverRow, mutedText, roundButton, surface } from './ui';

interface Props {
  routes: Route[];
  selectedRouteIds: string[];
  /** An empty list shows vehicles from every route. */
  onChange: (routeIds: string[]) => void;
}

/** Button that opens a list of routes to toggle on and off, filterable by vehicle type. */
export function RoutePicker({ routes, selectedRouteIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransportType | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The menu stays open while toggling, so close it on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const visible = routes.filter((r) => type === null || r.type === type);
  const noneSelected = selectedRouteIds.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label="Select routes"
        aria-expanded={open}
        title="Routes"
        className={roundButton}
        onClick={() => setOpen((o) => !o)}
      >
        <TbRoute className="h-6 w-6" />
      </button>
      {!noneSelected && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-900 px-1 text-xs font-semibold text-white ring-2 ring-white dark:bg-white dark:text-ink-900 dark:ring-ink-800">
          {selectedRouteIds.length}
        </span>
      )}

      {open && (
        <div
          className={`absolute bottom-12 left-0 flex h-[min(28rem,60vh)] w-72 flex-col overflow-hidden rounded-2xl shadow-lg ${surface}`}
        >
          <TypeFilter
            value={type}
            onChange={setType}
            className="border-b border-ink-200 p-2 dark:border-ink-700"
          />

          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            <li>
              <button
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${hoverRow}`}
                onClick={() => onChange([])}
              >
                <span className={noneSelected ? 'font-semibold' : ''}>All routes</span>
                {noneSelected && <TbCheck className="h-4 w-4" />}
              </button>
            </li>
            <RouteChecklistItems
              routes={visible}
              selectedRouteIds={selectedRouteIds}
              onToggle={(id) => onChange(toggleRoute(selectedRouteIds, id))}
              onPick={(id) => onChange(toggleRoute(selectedRouteIds, id))}
            />
            {visible.length === 0 && (
              <li className={`px-4 py-3 text-sm ${mutedText}`}>No routes of this type.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
