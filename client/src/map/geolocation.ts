import type { UserLocation } from './types';

/** Asks the browser for the current position. Rejects if unavailable or denied. */
export function getCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lng: coords.longitude,
          lat: coords.latitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}
