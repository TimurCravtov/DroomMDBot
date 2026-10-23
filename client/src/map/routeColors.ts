import type { Route, RouteDirection, TransportType } from '../api';

// Pantone-inspired colors spread around the whole color wheel. Pantone does not
// publish official screen values, so these are sRGB approximations in the spirit of
// the named shades. Consecutive entries are far apart in hue (red, blue, yellow,
// green, orchid, orange...) so neighbouring route numbers are easy to tell apart.
export const PALETTE = [
  '#D62839', // Fiery Red
  '#0072CE', // French Blue
  '#F5B700', // Empire Yellow
  '#2F9E5B', // Foliage Green
  '#B14AB5', // Radiant Orchid
  '#F26B21', // Orange Pop
  '#0097A7', // Peacock
  '#E5678F', // Azalea Pink
  '#4B4FB8', // Blue Iris
  '#A6C614', // Lime Punch
  '#8C5A3C', // Chocolate
  '#3FA7E0', // Little Boy Blue
  '#8E1B3A', // Wine
  '#00997A', // Emerald
  '#7E4BC2', // Ultra Violet
  '#D6389A', // Raspberry
  '#5CC9A7', // Mint
  '#7E8B2E', // Olive
];

// Trolleybuses and buses share the palette but start at different points, so routes
// that carry the same number on both types still differ in color.
const START: Record<TransportType, number> = { trolleybus: 0, bus: 9, minibus: 4 };

/**
 * Gives every route its own color. Routes of one type take colors in list order (the
 * API lists them by number), so neighbouring numbers differ; the palette repeats only
 * after a full cycle of 18.
 */
export function buildRouteColors(routes: Route[]): Record<string, string> {
  const used: Record<TransportType, number> = { trolleybus: 0, bus: 0, minibus: 0 };
  const colors: Record<string, string> = {};
  for (const route of routes) {
    colors[route.id] = PALETTE[(START[route.type] + used[route.type]++) % PALETTE.length];
  }
  return colors;
}

/** Share of white mixed into a route's color for the way back. */
const BACK_LIGHTEN = 0.3;

/**
 * The color of one direction of a route: the route's own color for the forward direction
 * (and when the direction is unknown), a slightly lighter shade of it for the way back.
 */
export function directionColor(hex: string, direction?: RouteDirection): string {
  if (direction !== 'back') return hex;
  const channel = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - BACK_LIGHTEN) + 255 * BACK_LIGHTEN);
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

/** White or near-black, whichever reads better on `hex` (WCAG contrast). */
export function readableTextColor(hex: string): string {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithWhite >= 3.2 ? '#ffffff' : '#1f1f1f';
}
