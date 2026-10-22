import { bearingDegrees, distanceMeters, type LatLng } from './geo';

/** A closed polyline through a route's stops, measured in meters. */
export interface Loop {
  points: LatLng[];
  /** cumulative[i] = distance from points[0] to points[i]. */
  cumulative: number[];
  total: number;
  /** Distance along the loop at which each stop sits. */
  stopOffsets: Map<string, number>;
}

export function buildLoop(stops: { id: string; lat: number; lng: number }[]): Loop {
  const points: LatLng[] = [...stops, stops[0]];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceMeters(points[i - 1], points[i]));
  }
  const stopOffsets = new Map(stops.map((s, i) => [s.id, cumulative[i]]));
  return { points, cumulative, total: cumulative[cumulative.length - 1], stopOffsets };
}

export function positionAt(loop: Loop, distance: number): LatLng & { heading: number } {
  const s = ((distance % loop.total) + loop.total) % loop.total;
  let i = 1;
  while (loop.cumulative[i] < s) i++;
  const from = loop.points[i - 1];
  const to = loop.points[i];
  const segment = loop.cumulative[i] - loop.cumulative[i - 1];
  const t = segment === 0 ? 0 : (s - loop.cumulative[i - 1]) / segment;
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
    heading: bearingDegrees(from, to),
  };
}
