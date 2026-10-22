import type { Route, Stop } from '../types';

// Approximate Chișinău coordinates; fake routes, not real EasyWay data.
export const MOCK_STOPS: Stop[] = [
  { id: 's1', name: 'Gara Feroviară', lat: 47.0136, lng: 28.8421 },
  { id: 's2', name: 'Piața Centrală', lat: 47.0182, lng: 28.8348 },
  { id: 's3', name: 'Piața Marii Adunări Naționale', lat: 47.0247, lng: 28.8323 },
  { id: 's4', name: 'Parcul Ștefan cel Mare', lat: 47.0258, lng: 28.829 },
  { id: 's5', name: 'Sala cu Orgă', lat: 47.0289, lng: 28.8225 },
  { id: 's6', name: 'Piața Rîșcani', lat: 47.0472, lng: 28.8393 },
];

/** Every mock route is a loop through its stops in order. */
export const MOCK_ROUTES: Route[] = [
  {
    id: 'tb1',
    number: '1',
    type: 'trolleybus',
    name: 'Gara – Sala cu Orgă',
    stopIds: ['s1', 's2', 's3', 's4', 's5'],
  },
  {
    id: 'tb22',
    number: '22',
    type: 'trolleybus',
    name: 'Gara – Rîșcani',
    stopIds: ['s1', 's2', 's3', 's6'],
  },
  {
    id: 'b30',
    number: '30',
    type: 'bus',
    name: 'Centru – Sala cu Orgă',
    stopIds: ['s2', 's4', 's5', 's3'],
  },
  {
    id: 'm121',
    number: '121',
    type: 'minibus',
    name: 'Rîșcani – Gara',
    stopIds: ['s6', 's3', 's2', 's1'],
  },
];
