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
  lat: number;
  lng: number;
}

export type NewPlace = Omit<Place, 'id'>;

export interface GeocodeResult {
  label: string;
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
