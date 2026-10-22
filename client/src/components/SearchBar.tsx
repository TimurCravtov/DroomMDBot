import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TbArrowLeft, TbMap2, TbMapPin, TbPlus, TbSearch, TbX } from 'react-icons/tb';
import type { Place, Route, StopSearchResult, TransportType } from '../api';
import { useSearch } from '../hooks/useTransport';
import { PlaceIcon } from './PlaceIcon';
import { RouteNumber } from './RouteColors';
import { TypeBadge, TYPE_LABEL } from './TypeBadge';
import { TypeFilter } from './TypeFilter';
import { closeButton, hoverRow, mutedText, surface } from './ui';

export type SearchShortcut = 'home' | 'work' | 'add' | 'map';

interface Props {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Fades the whole bar out, e.g. while picking a location on the map. */
  hidden: boolean;
  /** Saved places, shown as quick chips under the empty search field. */
  places: Place[];
  onSelectStop: (stopId: string) => void;
  onSelectRoute: (routeId: string) => void;
  onSelectPlace: (place: Place) => void;
  onShortcut: (shortcut: SearchShortcut) => void;
}

// Collapsed, the bar leaves room for the settings button on the left and the
// style + compass buttons on the right, and is capped at 36rem when centered.
const COLLAPSED_LEFT = 'max(4rem, calc(50% - 18rem))';
const COLLAPSED_RIGHT = 'max(7rem, calc(50% - 18rem))';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className={`px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide ${mutedText}`}>
        {title}
      </h2>
      <ul className={`overflow-hidden rounded-2xl ${surface}`}>{children}</ul>
    </section>
  );
}

function Chip({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-lg ${surface} ${hoverRow}`}
      onClick={onClick}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {hint && <span className={mutedText}>{hint}</span>}
    </button>
  );
}

/**
 * Search field that grows to the full width when focused. While empty it offers
 * shortcuts (home, work, add a place, select on map); once there is a query, the
 * results take over the whole screen and the bar stays on top of them.
 */
export function SearchBar({
  expanded,
  onExpandedChange,
  hidden,
  places,
  onSelectStop,
  onSelectRoute,
  onSelectPlace,
  onShortcut,
}: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TransportType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { data, loading } = useSearch(query);

  const hasQuery = query.trim() !== '';
  const showResults = expanded && hasQuery;
  const allRoutes: Route[] = data?.routes ?? [];
  const routes = allRoutes.filter((r) => type === null || r.type === type);
  const typesFound = new Set(allRoutes.map((r) => r.type));
  const stops: StopSearchResult[] = data?.stops ?? [];
  const foundPlaces: Place[] = data?.places ?? [];

  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  const customPlaces = places.filter((p) => p.kind === 'custom');

  const close = () => {
    setQuery('');
    setType(null);
    inputRef.current?.blur();
    onExpandedChange(false);
  };

  const pick = (fn: () => void) => {
    fn();
    close();
  };

  // With nothing typed there is nothing to keep open: a click outside collapses the bar.
  useEffect(() => {
    if (!expanded || hasQuery) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // `close` only uses stable setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hasQuery]);

  return (
    <>
      <div
        ref={barRef}
        className={`absolute top-4 z-[1000] transition-[left,right,opacity] duration-500 ease-in-out ${
          hidden ? 'pointer-events-none opacity-0' : ''
        }`}
        style={{
          left: expanded ? '1rem' : COLLAPSED_LEFT,
          right: expanded ? '1rem' : COLLAPSED_RIGHT,
        }}
      >
        <label
          className={`flex cursor-text items-center gap-2 rounded-full px-4 py-2.5 shadow-lg focus-within:ring-2 focus-within:ring-ink-400 ${surface}`}
        >
          {expanded ? (
            <button
              type="button"
              aria-label="Close search"
              className={closeButton}
              onClick={close}
            >
              <TbArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <TbSearch className="h-5 w-5 shrink-0 text-ink-400" />
          )}
          <input
            ref={inputRef}
            value={query}
            placeholder="Search stops, routes or places"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => onExpandedChange(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'Enter') {
                if (routes[0]) pick(() => onSelectRoute(routes[0].id));
                else if (stops[0]) pick(() => onSelectStop(stops[0].id));
                else if (foundPlaces[0]) pick(() => onSelectPlace(foundPlaces[0]));
              }
            }}
          />
          {expanded && hasQuery && (
            <button
              type="button"
              aria-label="Clear search"
              className={closeButton}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <TbX className="h-5 w-5" />
            </button>
          )}
        </label>

        {expanded && !hasQuery && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-2 [scrollbar-width:none]">
            <Chip
              icon={<PlaceIcon kind="home" className="h-4 w-4" />}
              label="Home"
              hint={home ? undefined : 'Set'}
              onClick={() => pick(() => (home ? onSelectPlace(home) : onShortcut('home')))}
            />
            <Chip
              icon={<PlaceIcon kind="work" className="h-4 w-4" />}
              label="Work"
              hint={work ? undefined : 'Set'}
              onClick={() => pick(() => (work ? onSelectPlace(work) : onShortcut('work')))}
            />
            {customPlaces.map((p) => (
              <Chip
                key={p.id}
                icon={<PlaceIcon kind="custom" className="h-4 w-4" />}
                label={p.label}
                onClick={() => pick(() => onSelectPlace(p))}
              />
            ))}
            <Chip
              icon={<TbPlus className="h-4 w-4" />}
              label="Add a place"
              onClick={() => pick(() => onShortcut('add'))}
            />
            <Chip
              icon={<TbMap2 className="h-4 w-4" />}
              label="Select on map"
              onClick={() => pick(() => onShortcut('map'))}
            />
          </div>
        )}
      </div>

      <div
        className={`fixed inset-0 z-[999] overflow-y-auto bg-ink-50 pt-20 transition-opacity duration-300 dark:bg-ink-900 ${
          showResults ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        inert={!showResults}
      >
        <div className="mx-auto max-w-2xl px-4 pb-8">
          {!data && loading && <p className={`px-4 py-6 text-sm ${mutedText}`}>Searching…</p>}

          {data && allRoutes.length + stops.length + foundPlaces.length === 0 && (
            <p className={`px-4 py-6 text-sm ${mutedText}`}>No results for “{query.trim()}”.</p>
          )}

          {allRoutes.length > 0 && (
            <TypeFilter
              value={type}
              onChange={setType}
              available={typesFound}
              showLabels
              className="px-0 pt-3"
            />
          )}

          {allRoutes.length > 0 && routes.length === 0 && type && (
            <p className={`px-4 py-3 text-sm ${mutedText}`}>
              No {TYPE_LABEL[type].toLowerCase()} routes match “{query.trim()}”.
            </p>
          )}

          {foundPlaces.length > 0 && (
            <Section title={`Places · ${foundPlaces.length}`}>
              {foundPlaces.map((p) => (
                <li key={p.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hoverRow}`}
                    onClick={() => pick(() => onSelectPlace(p))}
                  >
                    <PlaceIcon kind={p.kind} className="h-5 w-5 shrink-0 text-ink-400" />
                    <span className="truncate text-sm font-medium">{p.label}</span>
                  </button>
                </li>
              ))}
            </Section>
          )}

          {routes.length > 0 && (
            <Section title={`Routes · ${routes.length}`}>
              {routes.map((r) => (
                <li key={r.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hoverRow}`}
                    onClick={() => pick(() => onSelectRoute(r.id))}
                  >
                    <RouteNumber routeId={r.id} number={r.number} type={r.type} />
                    <TypeBadge type={r.type} />
                    <span className={`truncate text-sm ${mutedText}`}>{r.name}</span>
                  </button>
                </li>
              ))}
            </Section>
          )}

          {stops.length > 0 && (
            <Section title={`Stops · ${stops.length}`}>
              {stops.map((s) => (
                <li key={s.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hoverRow}`}
                    onClick={() => pick(() => onSelectStop(s.id))}
                  >
                    <TbMapPin className="h-5 w-5 shrink-0 text-ink-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className={`block truncate text-xs ${mutedText}`}>
                        Routes {s.routeNumbers.join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
