import type { Route, RouteCollection } from '../api';

/** Lower-case without diacritics, so "Ciocana" finds "Cioçana". */
export const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const words = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

/** Whether every word of the query starts the route's number or appears in its name. */
export function routeMatches(route: Route, query: string): boolean {
  const name = normalize(route.name);
  return words(query).every(
    (word) => route.number.toLowerCase().startsWith(word) || name.includes(word),
  );
}

/**
 * Whether a collection matches the query: every word has to hit its name or the number
 * (or name) of one of its routes, so "work" and "22" both find "To work: 1, 22, 30".
 */
export function collectionMatches(
  collection: RouteCollection,
  routesById: ReadonlyMap<string, Route>,
  query: string,
): boolean {
  const name = normalize(collection.name);
  const members = collection.routeIds.flatMap((id) => routesById.get(id) ?? []);
  return words(query).every(
    (word) => name.includes(word) || members.some((r) => routeMatches(r, word)),
  );
}
