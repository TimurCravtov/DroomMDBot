import { useEffect, useRef, useState } from 'react';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import { mutedText, roundButton, surface } from './ui';

interface Props {
  /** The base map in use; its provider's credit line is shown first. */
  mapStyleId: MapStyleId;
}

/** Credit strings contain links; open them in a new tab. */
const withBlankLinks = (html: string) => html.replace(/<a /g, '<a target="_blank" rel="noreferrer" ');

const REPO_URL = 'https://github.com/TimurCravtov/DroomMDBot';

const linkClass ='[&_a]:underline [&_a]:underline-offset-2';

/**
 * A round © button in the corner, the size of the other map buttons, that opens the credits for everything on the map: the base
 * map tiles, the transit feed, addresses, walking routes and the map library. Open
 * data licences require these credits to be visible, so they live here rather than
 * being removed.
 */
export function MapCredits({ mapStyleId }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const style = MAP_STYLES.find((s) => s.id === mapStyleId) ?? MAP_STYLES[0];
  const basemap = (style.style.sources.base as { attribution?: string }).attribution ?? '';

  return (
    <div ref={rootRef} className="absolute bottom-4 left-3 z-30">
      <button
        aria-label="Map data and credits"
        aria-expanded={open}
        title="Map data & credits"
        className={`${roundButton} text-lg font-medium`}
        onClick={() => setOpen((o) => !o)}
      >
        ©
      </button>

      {open && (
        <div className={`absolute bottom-12 left-0 w-72 rounded-2xl p-4 text-xs shadow-lg ${surface}`}>
          <h2 className="mb-2 text-sm font-semibold">Map data &amp; credits</h2>
          <dl className={`space-y-2 ${linkClass}`}>
            <div>
              <dt className={mutedText}>Base map</dt>
              <dd dangerouslySetInnerHTML={{ __html: withBlankLinks(basemap) }} />
            </div>
            <div>
              <dt className={mutedText}>Routes, stops and live vehicles</dt>
              <dd>
                <a href="https://tranzy.ai/opendata/" target="_blank" rel="noreferrer">
                  Tranzy open data
                </a>{' '}
                (RTEC &amp; PUA Chișinău)
              </dd>
            </div>
            <div>
              <dt className={mutedText}>Addresses and places</dt>
              <dd>
                <a href="https://nominatim.org" target="_blank" rel="noreferrer">
                  Nominatim
                </a>
                , ©{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap contributors
                </a>
              </dd>
            </div>
            <div>
              <dt className={mutedText}>Walking routes</dt>
              <dd>
                <a href="https://routing.openstreetmap.de" target="_blank" rel="noreferrer">
                  FOSSGIS routing
                </a>
                , ©{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap contributors
                </a>
              </dd>
            </div>
            <div>
              <dt className={mutedText}>Map library</dt>
              <dd>
                <a href="https://maplibre.org" target="_blank" rel="noreferrer">
                  MapLibre GL JS
                </a>
              </dd>
            </div>
            <div>
              <dt className={mutedText}>Source code</dt>
              <dd>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  TimurCravtov/DroomMDBot
                </a>{' '}
                (MIT)
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
