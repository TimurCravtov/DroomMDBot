import { useMapBearing } from '../hooks/useMapBearing';

// Half the size of a vehicle pill (about 52 x 30 px), to find its edge in any direction.
const HALF_W = 26;
const HALF_H = 15;
/** Space between the pill's edge and the arrow's center. */
const GAP = 8;

/**
 * A small triangle just outside a vehicle's pill, on the side the vehicle is heading.
 * Render it inside a `relative` box the size of the pill. The pill stays upright while the
 * map turns, so the arrow's compass heading is taken relative to the map's rotation.
 */
export function HeadingArrow({ heading, color }: { heading: number; color: string }) {
  const onScreen = heading - useMapBearing();
  const rad = (onScreen * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  // Where the line from the pill's center in this direction leaves its (elliptical) outline.
  const edge = 1 / Math.hypot(dx / HALF_W, dy / HALF_H);
  const r = edge + GAP;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{
        transform: `translate(-50%, -50%) translate(${dx * r}px, ${dy * r}px) rotate(${onScreen}deg)`,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" className="block drop-shadow">
        <polygon
          points="7,1 13,12 1,12"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
