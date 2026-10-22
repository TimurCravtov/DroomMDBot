/** One end of a planned journey. */
export interface Endpoint {
  label: string;
  lat: number;
  lng: number;
  kind: 'me' | 'place' | 'stop' | 'address' | 'map';
}

export interface UserLocation {
  lng: number;
  lat: number;
  /** Horizontal accuracy in meters. */
  accuracy: number;
  /** Direction of travel in degrees clockwise from north, when the device knows it. */
  heading?: number | null;
}
