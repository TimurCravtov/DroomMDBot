import type { TransportClient } from '../client';
import type { Arrival, Route, Stop, TransportType, Unsubscribe, Vehicle } from '../types';
import { MOCK_ROUTES, MOCK_STOPS } from './data';
import { buildLoop, positionAt, type Loop } from './loop';

const SPEED_MS: Record<TransportType, number> = {
  trolleybus: 6,
  bus: 7,
  minibus: 8.5,
};
const VEHICLES_PER_ROUTE = 3;

interface SimVehicle {
  id: string;
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

  constructor({ latencyMs = 150, tickMs = 1000 }: MockOptions = {}) {
    this.latencyMs = latencyMs;
    this.tickMs = tickMs;
    this.fleet = MOCK_ROUTES.flatMap((route) => {
      const loop = buildLoop(route.stopIds.map((id) => this.stopById(id)));
      return Array.from({ length: VEHICLES_PER_ROUTE }, (_, i) => ({
        id: `${route.id}-${i + 1}`,
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

  subscribeVehicles(
    routeId: string | null,
    onData: (vehicles: Vehicle[]) => void,
  ): Unsubscribe {
    const emit = () => onData(this.snapshot(routeId));
    emit();
    const timer = setInterval(emit, this.tickMs);
    return () => clearInterval(timer);
  }

  private snapshot(routeId: string | null): Vehicle[] {
    const now = Date.now();
    return this.fleet
      .filter((v) => routeId === null || v.route.id === routeId)
      .map((v) => {
        const { lat, lng, heading } = positionAt(v.loop, this.distanceAt(v, now));
        return {
          id: v.id,
          routeId: v.route.id,
          lat,
          lng,
          heading,
          speedKmh: Math.round(v.speedMs * 3.6),
          updatedAt: now,
        };
      });
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
