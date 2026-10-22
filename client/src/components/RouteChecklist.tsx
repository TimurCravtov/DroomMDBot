import { TbCheck } from 'react-icons/tb';
import type { Route } from '../api';
import { RouteNumber } from './RouteColors';
import { TypeBadge } from './TypeBadge';
import { hoverRow } from './ui';

/** Adds `id` to the selection, or removes it if already there. */
export function toggleRoute(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
}

interface Props {
  routes: Route[];
  selectedRouteIds: string[];
  onToggle: (routeId: string) => void;
  /** Taller rows, for full-width lists. */
  roomy?: boolean;
}

/** `<li>` rows with a checkbox per route; render inside a `<ul>`. */
export function RouteChecklistItems({ routes, selectedRouteIds, onToggle, roomy = false }: Props) {
  return (
    <>
      {routes.map((r) => {
        const checked = selectedRouteIds.includes(r.id);
        return (
          <li key={r.id}>
            <button
              role="checkbox"
              aria-checked={checked}
              className={`flex w-full items-center gap-3 px-4 text-left ${
                roomy ? 'py-3' : 'py-2.5'
              } ${hoverRow}`}
              onClick={() => onToggle(r.id)}
            >
              <RouteNumber routeId={r.id} number={r.number} type={r.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.name}</span>
                <span className="mt-0.5 block">
                  <TypeBadge type={r.type} />
                </span>
              </span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                  checked
                    ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                    : 'border-ink-300 dark:border-ink-600'
                }`}
              >
                {checked && <TbCheck className="h-4 w-4" />}
              </span>
            </button>
          </li>
        );
      })}
    </>
  );
}
