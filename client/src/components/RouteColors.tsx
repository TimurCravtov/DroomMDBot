import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TransportType } from '../api';
import type { Route } from '../api';
import { buildRouteColors, readableTextColor } from '../map/routeColors';
import { TYPE_COLOR } from './typeStyles';

const RouteColorsContext = createContext<Record<string, string>>({});

export function RouteColorsProvider({ routes, children }: { routes: Route[]; children: ReactNode }) {
  const colors = useMemo(() => buildRouteColors(routes), [routes]);
  return <RouteColorsContext.Provider value={colors}>{children}</RouteColorsContext.Provider>;
}

/** Color of every route by id. */
export function useRouteColors(): Record<string, string> {
  return useContext(RouteColorsContext);
}

/** One route's color; falls back to its type color while routes are still loading. */
export function useRouteColor(routeId: string, type: TransportType): string {
  return useContext(RouteColorsContext)[routeId] ?? TYPE_COLOR[type];
}

/** The route number on a pill in the route's own color. */
export function RouteNumber({
  routeId,
  number,
  type,
  className = '',
}: {
  routeId: string;
  number: string;
  type: TransportType;
  className?: string;
}) {
  const color = useRouteColor(routeId, type);
  return (
    <span
      style={{ background: color, color: readableTextColor(color) }}
      className={`inline-flex min-w-9 shrink-0 items-center justify-center rounded-lg px-2 py-0.5 text-sm font-bold ${className}`}
    >
      {number}
    </span>
  );
}
