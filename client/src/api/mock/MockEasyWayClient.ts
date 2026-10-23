import type { TransportClient } from '../client';
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
  RoutePath,
  SearchResults,
  Stop,
  TransportType,
  Unsubscribe,
  Vehicle,
} from '../types';
import { MOCK_ADDRESSES, MOCK_ROUTES, MOCK_STOPS } from './data';
import { distanceMeters } from '../geo';
import { buildLoop, positionAt, type Loop } from './loop';

const SPEED_MS: Record<TransportType, number> = {
  trolleybus: 6,
  bus: 7,
  minibus: 8.5,
};
const VEHICLES_PER_ROUTE = 3;

/** Words (EN/RO) that select a vehicle type, matched by prefix: "bus", "auto", "troleib"... */
const TYPE_ALIASES: Record<TransportType, string[]> = {
  trolleybus: ['trolleybus', 'troleibuz'],
  bus: ['bus', 'autobuz'],
  minibus: ['minibus', 'microbuz', 'rutiera'],
};

/** Lowercase and strip diacritics so "piata" matches "Piața". */
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every word of the query must hit the route's number, name or vehicle type. */
function routeMatches(route: Route, q: string): boolean {
  const name = normalize(route.name);
  return q.split(/\s+/).every(
    (word) =>
      route.number.startsWith(word) ||
      name.includes(word) ||
      TYPE_ALIASES[route.type].some((alias) => alias.startsWith(word)),
  );
}

const PLACES_KEY = 'mock.places';

function loadPlaces(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(PLACES_KEY) ?? '[]') as Place[];
  } catch {
    return [];
  }
}

const COLLECTIONS_KEY = 'mock.collections';

function loadCollections(): RouteCollection[] {
  try {
    return JSON.parse(localStorage.getItem(COLLECTIONS_KEY) ?? '[]') as RouteCollection[];
  } catch {
    return [];
  }
}

interface SimVehicle {
  id: string;
  /** Fake board number. */
  label: string;
  route: Route;
  loop: Loop;
  /** Distance along the loop at t = 0. */
  startOffset: number;
  speedMs: number;
}

export interface MockOptions {
  /** Simulated network latency for request/response calls. */
  latencyMs?: number;
  /** How often subscribeVehicles emits. */
  tickMs?: number;
}

/**
 * In-memory stand-in for the EasyWay feed. Vehicles drive around looped routes;
 * position is a pure function of time, so there is no state to keep in sync.
 */
export class MockEasyWayClient implements TransportClient {
  private readonly latencyMs: number;
  private readonly tickMs: number;
  private readonly epoch = Date.now();
  private readonly fleet: SimVehicle[];
  private places: Place[] = loadPlaces();
  private collections: RouteCollection[] = loadCollections();

  constructor({ latencyMs = 150, tickMs = 1000 }: MockOptions = {}) {
    this.latencyMs = latencyMs;
    this.tickMs = tickMs;
    this.fleet = MOCK_ROUTES.flatMap((route) => {
      const loop = buildLoop(route.stopIds.map((id) => this.stopById(id)));
      return Array.from({ length: VEHICLES_PER_ROUTE }, (_, i) => ({
        id: `${route.id}-${i + 1}`,
        label: String(1200 + MOCK_ROUTES.indexOf(route) * 10 + i),
        route,
        loop,
        startOffset: (loop.total / VEHICLES_PER_ROUTE) * i,
        speedMs: SPEED_MS[route.type],
      }));
    });
  }

  getStops(): Promise<Stop[]> {
    return this.respond(MOCK_STOPS);
  }

  getRoutes(): Promise<Route[]> {
    return this.respond(MOCK_ROUTES);
  }

  getArrivals(stopId: string): Promise<Arrival[]> {
    const now = Date.now();
    const arrivals: Arrival[] = [];
    for (const v of this.fleet) {
      const stopOffset = v.loop.stopOffsets.get(stopId);
      if (stopOffset === undefined) continue;
      const current = this.distanceAt(v, now);
      const ahead = (((stopOffset - current) % v.loop.total) + v.loop.total) % v.loop.total;
      arrivals.push({
        routeId: v.route.id,
        routeNumber: v.route.number,
        type: v.route.type,
        vehicleId: v.id,
        etaSeconds: Math.round(ahead / v.speedMs),
      });
    }
    return this.respond(arrivals.sort((a, b) => a.etaSeconds - b.etaSeconds));
  }

  /** The mock network is too small to plan on; use the live client for journeys. */
  planTrip(): Promise<Itinerary[]> {
    return this.respond([]);
  }

  getRoutePaths(routeId: string): Promise<RoutePath[]> {
    const route = MOCK_ROUTES.find((r) => r.id === routeId);
    if (!route) return this.respond([]);
    const loop = buildLoop(route.stopIds.map((id) => this.stopById(id)));
    return this.respond([
      { points: loop.points.map((p): LngLat => [p.lng, p.lat]), direction: 'forward' },
    ]);
  }

  search(query: string): Promise<SearchResults> {
    const q = normalize(query.trim());
    if (!q) return this.respond({ routes: [], stops: [], places: [] });
    return this.respond({
      places: this.places.filter((p) => normalize(p.label).includes(q)),
      routes: MOCK_ROUTES.filter((r) => routeMatches(r, q)),
      stops: MOCK_STOPS.filter((s) => normalize(s.name).includes(q)).map((s) => ({
        ...s,
        routeNumbers: MOCK_ROUTES.filter((r) => r.stopIds.includes(s.id)).map((r) => r.number),
      })),
    });
  }

  getSavedPlaces(): Promise<Place[]> {
    return this.respond([...this.places]);
  }

  savePlace(input: NewPlace): Promise<Place> {
    const unique = input.kind === 'home' || input.kind === 'work';
    const place: Place = {
      ...input,
      id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    };
    this.places = [...this.places.filter((p) => !unique || p.kind !== input.kind), place];
    this.persistPlaces();
    return this.respond(place);
  }

  deletePlace(placeId: string): Promise<void> {
    this.places = this.places.filter((p) => p.id !== placeId);
    this.persistPlaces();
    return this.respond(undefined);
  }

  getCollections(): Promise<RouteCollection[]> {
    return this.respond([...this.collections]);
  }

  saveCollection(input: NewRouteCollection): Promise<RouteCollection> {
    const collection: RouteCollection = {
      ...input,
      id: `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    };
    this.collections = [...this.collections, collection];
    this.persistCollections();
    return this.respond(collection);
  }

  updateCollection(collection: RouteCollection): Promise<RouteCollection> {
    this.collections = this.collections.map((c) => (c.id === collection.id ? collection : c));
    this.persistCollections();
    return this.respond(collection);
  }

  deleteCollection(collectionId: string): Promise<void> {
    this.collections = this.collections.filter((c) => c.id !== collectionId);
    this.persistCollections();
    return this.respond(undefined);
  }

  geocode(query: string): Promise<GeocodeResult[]> {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (words.length === 0) return this.respond([]);
    return this.respond(
      MOCK_ADDRESSES.filter((a) => words.every((w) => normalize(a.label).includes(w))).slice(0, 5),
    );
  }

  describeLocation(lat: number, lng: number): Promise<LocationInfo> {
    let nearestStop: Stop | null = null;
    let best = Infinity;
    for (const stop of MOCK_STOPS) {
      const d = distanceMeters({ lat, lng }, stop);
      if (d < best) {
        best = d;
        nearestStop = stop;
      }
    }
    return this.respond({
      label: nearestStop ? `Near ${nearestStop.name}` : 'Chișinău',
      nearestStop,
      distanceMeters: Math.round(best),
    });
  }

  subscribeVehicles(
    routeIds: readonly string[],
    onData: (vehicles: Vehicle[]) => void,
  ): Unsubscribe {
    const emit = () => onData(this.snapshot(routeIds));
    emit();
    const timer = setInterval(emit, this.tickMs);
    return () => clearInterval(timer);
  }

  private snapshot(routeIds: readonly string[]): Vehicle[] {
    const now = Date.now();
    return this.fleet
      .filter((v) => routeIds.length === 0 || routeIds.includes(v.route.id))
      .map((v) => {
        const { lat, lng, heading } = positionAt(v.loop, this.distanceAt(v, now));
        return {
          id: v.id,
          label: v.label,
          routeId: v.route.id,
          lat,
          lng,
          heading,
          hasHeading: true,
          speedKmh: Math.round(v.speedMs * 3.6),
          updatedAt: now,
        };
      });
  }

  private persistPlaces() {
    try {
      localStorage.setItem(PLACES_KEY, JSON.stringify(this.places));
    } catch {
      // storage unavailable; places live in memory only
    }
  }

  private persistCollections() {
    try {
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(this.collections));
    } catch {
      // storage unavailable; collections live in memory only
    }
  }

  private distanceAt(v: SimVehicle, now: number): number {
    return v.startOffset + v.speedMs * ((now - this.epoch) / 1000);
  }

  private stopById(id: string): Stop {
    const stop = MOCK_STOPS.find((s) => s.id === id);
    if (!stop) throw new Error(`Unknown mock stop: ${id}`);
    return stop;
  }

  private respond<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), this.latencyMs));
  }
}
