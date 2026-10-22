import type { TransportClient } from './client';
import { ApiClient } from './http/ApiClient';
import { MockEasyWayClient } from './mock/MockEasyWayClient';

export type { TransportClient } from './client';
export * from './types';

/**
 * The live client talks to the Go server in /server (proxied at /api in development).
 * Set VITE_USE_MOCK=true to run entirely on mock data instead, e.g. without the server.
 */
export function createClient(): TransportClient {
  const mock = new MockEasyWayClient();
  if (import.meta.env.VITE_USE_MOCK === 'true') return mock;
  // Saved places are not transit data, so they stay in the browser.
  return new ApiClient(import.meta.env.VITE_API_URL ?? '/api', mock);
}
