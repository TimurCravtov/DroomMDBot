import type { Arrival, Route, SearchResults, Stop, Unsubscribe, Vehicle } from './types';

/**
 * Transport data source. The UI only depends on this interface, so the mock
 * can be swapped for a real EasyWay-backed implementation without touching it.
 */
export interface TransportClient {
  getStops(): Promise<Stop[]>;
  getRoutes(): Promise<Route[]>;
  getArrivals(stopId: string): Promise<Arrival[]>;
  /** Finds routes (by number or name) and stops (by name). */
  search(query: string): Promise<SearchResults>;
  /**
   * Streams live vehicle positions, filtered to the given routes (all routes if empty).
   * Emits the current snapshot immediately, then on every update.
   */
  subscribeVehicles(
    routeIds: readonly string[],
    onData: (vehicles: Vehicle[]) => void,
  ): Unsubscribe;
}
