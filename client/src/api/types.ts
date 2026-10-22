export type TransportType = 'bus' | 'trolleybus' | 'minibus';

/** Longitude first, as map libraries expect. */
export type LngLat = [number, number];

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Route {
  id: string;
  number: string;
  type: TransportType;
  name: string;
  /** Ordered stop ids along the route. */
  stopIds: string[];
}

export interface Vehicle {
  id: string;
  /** Board number painted on the vehicle, e.g. "3878". */
  label: string;
  routeId: string;
  lat: number;
  lng: number;
  /** Degrees clockwise from north, 0-359. */
  heading: number;
  speedKmh: number;
  /** Unix ms of the last position fix. */
  updatedAt: number;
}

export interface Arrival {
  routeId: string;
  routeNumber: string;
  type: TransportType;
  vehicleId: string;
  etaSeconds: number;
}

export interface StopSearchResult extends Stop {
  /** Numbers of the routes that call at this stop. */
  routeNumbers: string[];
}

/** home / work / custom are saved by the user; pin is a temporary dropped pin. */
export type PlaceKind = 'home' | 'work' | 'custom' | 'pin';

export interface Place {
  id: string;
  kind: PlaceKind;
  label: string;
  /** Street address, when the place was found by address. */
  address?: string;
  /** Icon the user picked for a custom place (a key of PLACE_ICONS in the UI). */
  icon?: string;
  lat: number;
  lng: number;
}

export type NewPlace = Omit<Place, 'id'>;

/** One end of a leg. The name is absent for the trip's own start and destination. */
export interface PlanPlace {
  name?: string;
  lat: number;
  lng: number;
}

/** Either a walk or a ride on one route. */
export interface Leg {
  mode: 'walk' | 'transit';
  from: PlanPlace;
  to: PlanPlace;
  distanceM: number;
  durationS: number;
  path: LngLat[];
  /** Transit legs only. */
  routeId?: string;
  routeNumber?: string;
  type?: TransportType;
  stopCount?: number;
  /** Time spent waiting at the boarding stop, in seconds. */
  waitS?: number;
}

export interface Itinerary {
  /** Door to door, including waiting. */
  durationS: number;
  walkM: number;
  transfers: number;
  legs: Leg[];
}

export interface GeocodeResult {
  label: string;
  /** Secondary line, e.g. the district and city. */
  detail?: string;
  lat: number;
  lng: number;
}

export interface LocationInfo {
  /** Human-readable description of the point, e.g. "Near Piața Centrală". */
  label: string;
  nearestStop: Stop | null;
  distanceMeters: number;
}

export interface SearchResults {
  routes: Route[];
  stops: StopSearchResult[];
  places: Place[];
}

export type Unsubscribe = () => void;
