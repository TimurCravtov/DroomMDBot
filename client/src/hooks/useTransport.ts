import { useEffect, useRef, useState } from 'react';
import { useTransportClient } from '../api/context';
import type { LatLng } from '../api/geo';
import type {
  Arrival,
  GeocodeResult,
  Itinerary,
  LngLat,
  LocationInfo,
  NewPlace,
  NewRouteCollection,
  Place,
  Route,
  RouteCollection,
  SearchResults,
  Stop,
  Vehicle,
} from '../api';

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

/** The user's saved places (home, work, custom) with save / remove helpers. */
export function useSavedPlaces() {
  const client = useTransportClient();
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    let cancelled = false;
    void client.getSavedPlaces().then((p) => !cancelled && setPlaces(p));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const save = async (input: NewPlace) => {
    const place = await client.savePlace(input);
    setPlaces(await client.getSavedPlaces());
    return place;
  };

  const remove = async (placeId: string) => {
    await client.deletePlace(placeId);
    setPlaces(await client.getSavedPlaces());
  };

  return { places, save, remove };
}

/** The user's favourite routes: named collections, with save / update / remove helpers. */
export function useCollections() {
  const client = useTransportClient();
  const [collections, setCollections] = useState<RouteCollection[]>([]);

  useEffect(() => {
    let cancelled = false;
    client
      .getCollections()
      .then((c) => !cancelled && setCollections(c))
      .catch(() => {}); // favourites are a convenience; the app works without them
    return () => {
      cancelled = true;
    };
  }, [client]);

  const refresh = async () => setCollections(await client.getCollections());

  const save = async (input: NewRouteCollection) => {
    const collection = await client.saveCollection(input);
    await refresh();
    return collection;
  };

  const update = async (collection: RouteCollection) => {
    await client.updateCollection(collection);
    await refresh();
  };

  const remove = async (collectionId: string) => {
    await client.deleteCollection(collectionId);
    await refresh();
  };

  return { collections, save, update, remove };
}

/** Describes a map point (debounced); undefined while loading or when `point` is null. */
export function useLocationInfo(
  point: { lat: number; lng: number } | null,
  debounceMs = 200,
): LocationInfo | undefined {
  const client = useTransportClient();
  const [info, setInfo] = useState<LocationInfo>();
  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setInfo(undefined);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void client.describeLocation(lat, lng).then((r) => !cancelled && setInfo(r));
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, lat, lng, debounceMs]);

  return info;
}

/** Debounced address lookup; empty for an empty query. */
export function useGeocode(query: string, debounceMs = 200): GeocodeResult[] {
  const client = useTransportClient();
  const [results, setResults] = useState<GeocodeResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void client.geocode(q).then((r) => !cancelled && setResults(r));
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, query, debounceMs]);

  return results;
}

/**
 * Drawable paths for the given routes, keyed by route id. Each route is fetched once
 * (the client caches static data); routes still loading are simply absent.
 */
export function useRoutePaths(routeIds: readonly string[]): Record<string, LngLat[][]> {
  const client = useTransportClient();
  const [paths, setPaths] = useState<Record<string, LngLat[][]>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    for (const id of routeIds) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      client
        .getRoutePaths(id)
        .then((p) => setPaths((prev) => ({ ...prev, [id]: p })))
        .catch(() => requested.current.delete(id)); // retry the next time it is selected
    }
  }, [client, routeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return paths;
}

/** How often a shown journey is re-planned, so waits follow the live vehicles. */
const PLAN_REFRESH_MS = 30_000;

/** Journeys between two points; refreshed in the background while both are set. */
export function usePlan(
  from: LatLng | null,
  to: LatLng | null,
): { data?: Itinerary[]; loading: boolean; error?: Error } {
  const client = useTransportClient();
  const [state, setState] = useState<{ data?: Itinerary[]; loading: boolean; error?: Error }>({
    loading: false,
  });
  const key = from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : '';

  useEffect(() => {
    if (!from || !to) {
      setState({ loading: false });
      return;
    }
    let cancelled = false;
    setState({ loading: true });

    const run = (quiet: boolean) =>
      client
        .planTrip(from, to)
        .then((data) => !cancelled && setState({ data, loading: false }))
        .catch((error: Error) => {
          // A failed background refresh keeps showing the last good result.
          if (!cancelled && !quiet) setState({ loading: false, error });
        });

    void run(false);
    const timer = setInterval(() => void run(true), PLAN_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // `from` / `to` are rebuilt every render; `key` identifies when they really change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  return state;
}
