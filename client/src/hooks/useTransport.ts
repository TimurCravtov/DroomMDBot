import { useEffect, useState } from 'react';
import { useTransportClient } from '../api/context';
import type { Arrival, Route, Stop, Vehicle } from '../api';

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

export function useVehicles(routeId: string | null): Vehicle[] {
  const client = useTransportClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => client.subscribeVehicles(routeId, setVehicles), [client, routeId]);

  return vehicles;
}
