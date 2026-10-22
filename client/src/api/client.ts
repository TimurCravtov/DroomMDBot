import type { LatLng } from './geo';
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
} from './types';

/**
 * Transport data source. The UI only depends on this interface, so the mock
 * can be swapped for a real EasyWay-backed implementation without touching it.
 */
export interface TransportClient {
  getStops(): Promise<Stop[]>;
  getRoutes(): Promise<Route[]>;
  getArrivals(stopId: string): Promise<Arrival[]>;
  /** Drawable paths of a route, one per direction. */
  getRoutePaths(routeId: string): Promise<LngLat[][]>;
  /** Finds routes (by number or name), stops and saved places (by name). */
  search(query: string): Promise<SearchResults>;
  getSavedPlaces(): Promise<Place[]>;
  /** Saving a home or work place replaces the previous one of that kind. */
  savePlace(place: NewPlace): Promise<Place>;
  deletePlace(placeId: string): Promise<void>;
  /** Journeys from one point to another, fastest first (walking and riding legs). */
  planTrip(from: LatLng, to: LatLng): Promise<Itinerary[]>;
  /** Finds street addresses matching free text. */
  geocode(query: string): Promise<GeocodeResult[]>;
  /** Describes an arbitrary map point, e.g. for a dropped pin. */
  describeLocation(lat: number, lng: number): Promise<LocationInfo>;
  /**
   * Streams live vehicle positions, filtered to the given routes (all routes if empty).
   * Emits the current snapshot immediately, then on every update.
   */
  subscribeVehicles(
    routeIds: readonly string[],
    onData: (vehicles: Vehicle[]) => void,
  ): Unsubscribe;
}
