import type { Route, Stop } from '../types';

// Approximate Chișinău coordinates; fake routes, not real EasyWay data.
export const MOCK_STOPS: Stop[] = [
  { id: 's1', name: 'Gara Feroviară', lat: 47.0136, lng: 28.8421 },
  { id: 's2', name: 'Piața Centrală', lat: 47.0182, lng: 28.8348 },
  { id: 's3', name: 'Piața Marii Adunări Naționale', lat: 47.0247, lng: 28.8323 },
  { id: 's4', name: 'Parcul Ștefan cel Mare', lat: 47.0258, lng: 28.829 },
  { id: 's5', name: 'Sala cu Orgă', lat: 47.0289, lng: 28.8225 },
  { id: 's6', name: 'Piața Rîșcani', lat: 47.0472, lng: 28.8393 },
  { id: 's7', name: 'Parcul Valea Morilor', lat: 47.0093, lng: 28.8365 },
  { id: 's8', name: 'Circul', lat: 47.0299, lng: 28.8146 },
  { id: 's9', name: 'Autogara Centru', lat: 47.0108, lng: 28.833 },
  { id: 's10', name: 'Universitatea de Stat', lat: 47.0196, lng: 28.8283 },
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
  {
    id: 'tb2',
    number: '2',
    type: 'trolleybus',
    name: 'Valea Morilor – Circul',
    stopIds: ['s7', 's10', 's3', 's8'],
  },
  {
    id: 'tb10',
    number: '10',
    type: 'trolleybus',
    name: 'Autogara – Rîșcani',
    stopIds: ['s9', 's2', 's3', 's6'],
  },
  {
    id: 'b45',
    number: '45',
    type: 'bus',
    name: 'Autogara – Universitate',
    stopIds: ['s9', 's10', 's4'],
  },
  {
    id: 'm152',
    number: '152',
    type: 'minibus',
    name: 'Circul – Gara',
    stopIds: ['s8', 's5', 's3', 's2', 's1'],
  },
];
