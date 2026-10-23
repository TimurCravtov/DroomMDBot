import { TbCheck } from 'react-icons/tb';
import type { Route } from '../api';
import { useI18n } from '../i18n';
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
  /** Taller rows, for full-width lists. */
  roomy?: boolean;
  /**
   * Tapping a row's body. Without it, a row toggles like its checkbox does.
   * Typically "show this route and leave the list".
   */
  onPick?: (routeId: string) => void;
  /** Tapping a row's checkbox; rows have no checkbox without this. */
  onToggle?: (routeId: string) => void;
}

/** `<li>` rows for routes, optionally with a checkbox for multi-select; render inside a `<ul>`. */
export function RouteChecklistItems({
  routes,
  selectedRouteIds,
  roomy = false,
  onPick,
  onToggle,
}: Props) {
  const { t } = useI18n();
  const padding = roomy ? 'py-3' : 'py-2.5';
  return (
    <>
      {routes.map((r) => {
        const checked = selectedRouteIds.includes(r.id);
        return (
          <li key={r.id} className="flex items-stretch">
            <button
              className={`flex min-w-0 flex-1 items-center gap-3 pl-4 text-left ${padding} ${
                onToggle ? 'pr-2' : 'pr-4'
              } ${hoverRow}`}
              onClick={() => (onPick ?? onToggle)?.(r.id)}
            >
              <RouteNumber routeId={r.id} number={r.number} type={r.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.name}</span>
                <span className="mt-0.5 block">
                  <TypeBadge type={r.type} />
                </span>
              </span>
            </button>

            {onToggle && (
              <button
                role="checkbox"
                aria-checked={checked}
                aria-label={t('routes.select', { number: r.number })}
                className={`flex items-center px-4 ${hoverRow}`}
                onClick={() => onToggle(r.id)}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    checked
                      ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                      : 'border-ink-300 dark:border-ink-600'
                  }`}
                >
                  {checked && <TbCheck className="h-4 w-4" />}
                </span>
              </button>
            )}
          </li>
        );
      })}
    </>
  );
}
