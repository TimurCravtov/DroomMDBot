import { useEffect, useState } from 'react';
import { useTransportClient } from '../api/context';
import type { Arrival, Route, SearchResults, Stop, Vehicle } from '../api';

interface Fetched<T> {
  data: T | undefined;
  error: Error | undefined;
}

/** Runs `fetcher` on mount / when `key` changes, and again every `intervalMs` if given. */
function useFetched<T>(fetcher: () => Promise<T>, key: unknown, intervalMs?: number): Fetched<T> {
  const [state, setState] = useState<Fetched<T>>({ data: undefined, error: undefined });

  useEffect(() => {
    let cancelled = false;
    setState({ data: undefined, error: undefined });

    const run = async () => {
      try {
        const data = await fetcher();
        if (!cancelled) setState({ data, error: undefined });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: e as Error }));
      }
    };

    void run();
    const timer = intervalMs ? setInterval(run, intervalMs) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // `fetcher` is rebuilt every render; `key` identifies when it actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs]);

  return state;
}

export function useStops(): Fetched<Stop[]> {
  const client = useTransportClient();
  return useFetched(() => client.getStops(), client);
}

export function useRoutes(): Fetched<Route[]> {
  const client = useTransportClient();
  return useFetched(() => client.getRoutes(), client);
}

export function useArrivals(stopId: string | null, pollMs = 5000): Fetched<Arrival[]> {
  const client = useTransportClient();
  return useFetched(
    () => (stopId ? client.getArrivals(stopId) : Promise.resolve([])),
    `${stopId}`,
    pollMs,
  );
}

/** Live vehicles for the given routes; an empty list means every route. */
export function useVehicles(routeIds: readonly string[]): Vehicle[] {
  const client = useTransportClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const key = routeIds.join(',');
  // `routeIds` is a fresh array each render; `key` identifies when it really changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => client.subscribeVehicles(routeIds, setVehicles), [client, key]);

  return vehicles;
}

/** Debounced search; `data` is undefined for an empty query. */
export function useSearch(
  query: string,
  debounceMs = 150,
): { data: SearchResults | undefined; loading: boolean } {
  const client = useTransportClient();
  const [data, setData] = useState<SearchResults>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setData(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await client.search(q);
        if (!cancelled) setData(results);
      } catch {
        if (!cancelled) setData(undefined);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, query, debounceMs]);

  return { data, loading };
}
