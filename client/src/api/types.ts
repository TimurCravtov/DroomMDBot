export type TransportType = 'bus' | 'trolleybus' | 'minibus';

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

export type Unsubscribe = () => void;
