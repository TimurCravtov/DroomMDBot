import type { UserLocation } from './types';

function position(options: PositionOptions): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lng: coords.longitude,
          lat: coords.latitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
        }),
      reject,
      options,
    );
  });
}

/**
 * Asks the browser for the current position. Rejects if unavailable or denied.
 *
 * Tries the quick network/cached fix first: GPS-only requests often time out on laptops and
 * indoors, which would leave the map where it was. Falls back to a high-accuracy fix.
 */
export async function getCurrentLocation(): Promise<UserLocation> {
  if (!('geolocation' in navigator)) throw new Error('Geolocation is not available');
  try {
    return await position({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 });
  } catch (error) {
    // A refusal won't change by asking again.
    if ((error as GeolocationPositionError).code === 1) throw error;
    return position({ enableHighAccuracy: true, timeout: 15_000 });
  }
}
