import type { Arrival, Route, Stop, Unsubscribe, Vehicle } from './types';

/**
 * Transport data source. The UI only depends on this interface, so the mock
 * can be swapped for a real EasyWay-backed implementation without touching it.
 */
export interface TransportClient {
  getStops(): Promise<Stop[]>;
  getRoutes(): Promise<Route[]>;
  getArrivals(stopId: string): Promise<Arrival[]>;
  /**
   * Streams live vehicle positions, optionally filtered to one route.
   * Emits the current snapshot immediately, then on every update.
   */
  subscribeVehicles(
    routeId: string | null,
    onData: (vehicles: Vehicle[]) => void,
  ): Unsubscribe;
}
