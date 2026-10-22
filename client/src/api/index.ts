import type { TransportClient } from './client';
import { MockEasyWayClient } from './mock/MockEasyWayClient';

export type { TransportClient } from './client';
export * from './types';

/** Single place to swap the mock for the real EasyWay client later. */
export function createClient(): TransportClient {
  return new MockEasyWayClient();
}
