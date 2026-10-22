import type { TransportClient } from '../client';
import { distanceMeters, type LatLng } from '../geo';
import type {
  Arrival,
  GeocodeResult,
  Itinerary,
  LngLat,
  LocationInfo,
  NewPlace,
  Place,
  Route,
  SearchResults,
  Stop,
  Unsubscribe,
  Vehicle,
} from '../types';

/** The parts of the transport API that the Go server does not provide. */
type LocalPart = Pick<TransportClient, 'getSavedPlaces' | 'savePlace' | 'deletePlace' | 'search'>;

/**
 * Talks to the Go server (see /server) for live transit data and address lookup.
 * Saved places are delegated to `local`, since they are not transit data.
 */
export class ApiClient implements TransportClient {
  private stops?: Promise<Stop[]>;
  private routes?: Promise<Route[]>;
  private readonly paths = new Map<string, Promise<LngLat[][]>>();

  constructor(
    private readonly baseUrl: string,
    private readonly local: LocalPart,
  ) {}

  getStops(): Promise<Stop[]> {
    // Static for hours: fetch once. A failure is not cached, so a retry can succeed.
    this.stops ??= this.json<Stop[]>('/stops').catch((e) => {
      this.stops = undefined;
      throw e;
    });
    return this.stops;
  }

  getRoutes(): Promise<Route[]> {
    this.routes ??= this.json<Route[]>('/routes').catch((e) => {
      this.routes = undefined;
      throw e;
    });
    return this.routes;
  }

  getRoutePaths(routeId: string): Promise<LngLat[][]> {
    let paths = this.paths.get(routeId);
    if (!paths) {
      paths = this.json<{ paths: LngLat[][] }>(`/routes/${encodeURIComponent(routeId)}/shapes`)
        .then((r) => r.paths)
        .catch((e) => {
          this.paths.delete(routeId);
          throw e;
        });
      this.paths.set(routeId, paths);
    }
    return paths;
  }

  getArrivals(stopId: string): Promise<Arrival[]> {
    return this.json<Arrival[]>(`/stops/${encodeURIComponent(stopId)}/arrivals`);
  }

  async search(query: string): Promise<SearchResults> {
    const [remote, local] = await Promise.all([
      this.json<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
      this.local.search(query),
    ]);
    return { routes: remote.routes, stops: remote.stops, places: local.places };
  }

  subscribeVehicles(
    routeIds: readonly string[],
    onData: (vehicles: Vehicle[]) => void,
  ): Unsubscribe {
    const query = routeIds.length ? `?routes=${routeIds.map(encodeURIComponent).join(',')}` : '';
    // EventSource reconnects by itself if the connection drops.
    const source = new EventSource(`${this.baseUrl}/vehicles/stream${query}`);
    source.onmessage = (event) => {
      try {
        onData(JSON.parse(event.data) as Vehicle[]);
      } catch {
        // ignore a malformed frame; the next one replaces it
      }
    };
    return () => source.close();
  }

  getSavedPlaces(): Promise<Place[]> {
    return this.local.getSavedPlaces();
  }

  savePlace(place: NewPlace): Promise<Place> {
    return this.local.savePlace(place);
  }

  deletePlace(placeId: string): Promise<void> {
    return this.local.deletePlace(placeId);
  }

  planTrip(from: LatLng, to: LatLng): Promise<Itinerary[]> {
    return this.json<Itinerary[]>(`/plan?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`);
  }

  async geocode(query: string): Promise<GeocodeResult[]> {
    if (query.trim().length < 2) return [];
    try {
      return await this.json<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(query)}`);
    } catch {
      return []; // the geocoder being down shouldn't break typing in the search box
    }
  }

  async describeLocation(lat: number, lng: number): Promise<LocationInfo> {
    const stops = await this.getStops();
    let nearestStop: Stop | null = null;
    let best = Infinity;
    for (const stop of stops) {
      const d = distanceMeters({ lat, lng }, stop);
      if (d < best) {
        best = d;
        nearestStop = stop;
      }
    }
    return {
      label: nearestStop ? `Near ${nearestStop.name}` : 'Chișinău',
      nearestStop,
      distanceMeters: Number.isFinite(best) ? Math.round(best) : 0,
    };
  }

  private async json<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  }
}
