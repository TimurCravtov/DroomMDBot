import { TbX } from 'react-icons/tb';
import type { Route } from '../api';
import { RouteNumber } from './RouteColors';
import { TypeBadge, TypeIcon } from './TypeBadge';
import { closeButton, mutedText, surface } from './ui';

interface Props {
  routes: Route[];
  onRemove: (routeId: string) => void;
  onClear: () => void;
}

/** Chips for the routes currently shown on the map. A lone route gets its full details. */
export function SelectedRoutes({ routes, onRemove, onClear }: Props) {
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
