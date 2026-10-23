import { TbArrowNarrowRight, TbX } from 'react-icons/tb';
import type { Route, RoutePath } from '../api';
import { directionColor } from '../map/routeColors';
import { RouteNumber, useRouteColor } from './RouteColors';
import { TypeBadge, TypeIcon } from './TypeBadge';
import { closeButton, mutedText, surface } from './ui';

interface Props {
  routes: Route[];
  /** Drawn paths per route id; a lone route lists where each direction leads. */
  routePaths: Record<string, RoutePath[]>;
  onRemove: (routeId: string) => void;
  onClear: () => void;
}

/** Chips for the routes currently shown on the map. A lone route gets its full details. */
export function SelectedRoutes({ routes, routePaths, onRemove, onClear }: Props) {
  const single = routes.length === 1;

  return (
    <div className="flex max-w-full flex-wrap justify-center gap-2">
      {routes.map((r) => (
        <div
          key={r.id}
          className={`flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-sm shadow-lg ${surface}`}
        >
          {single ? (
            <>
              <RouteNumber routeId={r.id} number={r.number} type={r.type} />
              <TypeBadge type={r.type} />
              <span className={mutedText}>{r.name}</span>
            </>
          ) : (
            <>
              <TypeIcon type={r.type} className="h-4 w-4" />
              <RouteNumber routeId={r.id} number={r.number} type={r.type} />
            </>
          )}
          <button
            aria-label={`Hide route ${r.number}`}
            className={closeButton}
            onClick={() => onRemove(r.id)}
          >
            <TbX className="h-4 w-4" />
          </button>
        </div>
      ))}
      {single && <DirectionLegend route={routes[0]} paths={routePaths[routes[0].id] ?? []} />}
      {!single && (
        <button
          className={`rounded-full px-3 py-1.5 text-sm shadow-lg ${surface} ${mutedText}`}
          onClick={onClear}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

/** Where each direction of a route leads, in the shade its vehicles and line are drawn in. */
function DirectionLegend({ route, paths }: { route: Route; paths: RoutePath[] }) {
  const color = useRouteColor(route.id, route.type);
  // A direction can have several shapes; list each destination once.
  const seen = new Set<string>();
  const entries = paths.filter((p) => {
    if (!p.direction || !p.toward) return false;
    const key = `${p.direction}|${p.toward}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (entries.length === 0) return null;

  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      {entries.map((p) => (
        <span
          key={`${p.direction}|${p.toward}`}
          title={p.direction === 'back' ? 'The way back' : 'Forward'}
          className={`flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs shadow-lg ${surface}`}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: directionColor(color, p.direction) }}
          />
          <TbArrowNarrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{p.toward}</span>
        </span>
      ))}
    </div>
  );
}
