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
  /** Whether the panel is showing. Controlled, so the search can open it too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The Routes button and its panel: a small sheet above the button listing every route,
 * so the map stays visible. Tapping a route shows it and collapses the panel; a
 * route's checkbox adds it to a multi-selection and keeps the panel open.
 */
export function RoutePicker({ routes, selectedRouteIds, onChange, open, onOpenChange }: Props) {
  const [type, setType] = useState<TransportType | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Collapse on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  const visible = routes.filter((r) => type === null || r.type === type);
  const noneSelected = selectedRouteIds.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label="Select routes"
        aria-expanded={open}
        title="Routes"
        className={roundButton}
        onClick={() => onOpenChange(!open)}
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
          className={`absolute bottom-12 left-0 z-20 flex h-[min(26rem,45vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl shadow-lg ${surface}`}
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
                onClick={() => {
                  onChange([]);
                  onOpenChange(false);
                }}
              >
                <span className={noneSelected ? 'font-semibold' : ''}>All routes</span>
                {noneSelected && <TbCheck className="h-4 w-4" />}
              </button>
            </li>
            <RouteChecklistItems
              routes={visible}
              selectedRouteIds={selectedRouteIds}
              onPick={(id) => {
                onChange([id]);
                onOpenChange(false);
              }}
              onToggle={(id) => onChange(toggleRoute(selectedRouteIds, id))}
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
