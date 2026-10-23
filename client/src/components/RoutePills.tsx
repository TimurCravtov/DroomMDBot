import type { Route } from '../api';
import { RouteNumber } from './RouteColors';
import { mutedText } from './ui';

/** Route pills shown per collection before "+N". */
const PREVIEW = 8;

/** A short row of route numbers, e.g. the contents of a favourite. */
export function RoutePills({ routes, max = PREVIEW }: { routes: Route[]; max?: number }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {routes.slice(0, max).map((r) => (
        <RouteNumber key={r.id} routeId={r.id} number={r.number} type={r.type} />
      ))}
      {routes.length > max && (
        <span className={`self-center text-xs ${mutedText}`}>+{routes.length - max}</span>
      )}
    </span>
  );
}
