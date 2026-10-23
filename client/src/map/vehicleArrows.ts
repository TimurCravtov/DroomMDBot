import type { Map as MapLibreMap } from 'maplibre-gl';

/** Images are named `vehicle-arrow-#rrggbb`: one triangle per vehicle color. */
export const VEHICLE_ARROW_PREFIX = 'vehicle-arrow-';

const SIZE = 44; // px of the canvas; registered at 2x, so 22 css px

/** A triangle pointing north in `color`, with a white outline so it reads on any map. */
function drawArrow(color: string): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2, 6);
  ctx.lineTo(SIZE - 8, SIZE - 8);
  ctx.lineTo(8, SIZE - 8);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function addArrow(map: MapLibreMap, color: string) {
  const id = VEHICLE_ARROW_PREFIX + color;
  if (map.hasImage(id)) return;
  const image = drawArrow(color);
  if (image) map.addImage(id, image, { pixelRatio: 2 });
}

/**
 * Keeps an arrow image on the map for each of `colors`. Images are added up front (a layer
 * that asks for one the map lacks stays blank for a while), and again after a style
 * change, which clears them. Returns a function that stops listening.
 */
export function provideVehicleArrows(map: MapLibreMap, colors: readonly string[]): () => void {
  const addAll = () => {
    try {
      for (const color of colors) addArrow(map, color);
    } catch {
      // the style is being replaced; the next styledata event tries again
    }
  };
  const onMissing = (e: { id: string }) => {
    if (e.id.startsWith(VEHICLE_ARROW_PREFIX))
      addArrow(map, e.id.slice(VEHICLE_ARROW_PREFIX.length));
  };

  addAll();
  map.on('styledata', addAll);
  map.on('styleimagemissing', onMissing);
  return () => {
    map.off('styledata', addAll);
    map.off('styleimagemissing', onMissing);
  };
}
