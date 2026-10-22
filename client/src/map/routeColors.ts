import type { Route, TransportType } from '../api';

// Pantone-inspired palettes. Pantone does not publish official screen values, so the
// hexes are common sRGB approximations of the named colors. Trolleybuses get warm
// tones and buses cool/earthy ones, so the vehicle type reads at a glance while each
// route still has its own color. No blues, to match the rest of the interface.
export const PALETTES: Record<TransportType, string[]> = {
  trolleybus: [
    '#DD4124', // Tangerine Tango
    '#9B1B30', // Chili Pepper
    '#D94F70', // Honeysuckle
    '#E3873A', // Amberglow
    '#955251', // Marsala
    '#C74375', // Fuchsia Rose
    '#F2A900', // Marigold
    '#FF6F61', // Living Coral
    '#A0522D', // Sienna
    '#B76E79', // Rose Gold
    '#C1440E', // Burnt Orange
    '#EFC050', // Mimosa
    '#BD3D3A', // Cardinal
    '#E9897E', // Coral Pink
    '#800F2F', // Burgundy
    '#CE5B78', // Dusty Rose
  ],
  bus: [
    '#009473', // Emerald
    '#5F4B8B', // Ultra Violet
    '#88B04B', // Greenery
    '#B163A3', // Radiant Orchid
    '#006E51', // Lush Meadow
    '#926AA6', // Amethyst Orchid
    '#55B4B0', // Turquoise
    '#7C8F68', // Sage
    '#8E6BB0', // Royal Lilac
    '#4F6D4F', // Kale
    '#9DA94B', // Linden Green
    '#7F5A83', // Chinese Violet
    '#3F8E7E', // Deep Lichen
    '#B5A642', // Olive Gold
    '#2F7F6F', // Ivy
    '#8D8F5E', // Dried Herb
  ],
  minibus: [
    '#D97B29', // Autumn Maple
    '#7B6D8D', // Lavender Gray
    '#A65E2E', // Cinnamon
    '#6F8F72', // Hedge Green
  ],
};

/**
 * Gives every route its own color. Routes of one type take colors from that type's
 * palette in list order (the API lists them by number), so neighbouring numbers
 * differ; the palette repeats only after a full cycle.
 */
export function buildRouteColors(routes: Route[]): Record<string, string> {
  const used: Record<TransportType, number> = { trolleybus: 0, bus: 0, minibus: 0 };
  const colors: Record<string, string> = {};
  for (const route of routes) {
    const palette = PALETTES[route.type];
    colors[route.id] = palette[used[route.type]++ % palette.length];
  }
  return colors;
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
