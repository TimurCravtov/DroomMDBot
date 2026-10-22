import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TbArrowLeft, TbChevronRight, TbMap2, TbMapPin, TbPlus, TbSearch, TbX } from 'react-icons/tb';
import type { GeocodeResult, Place, Route, StopSearchResult, TransportType } from '../api';
import { useGeocode, useSearch } from '../hooks/useTransport';
import { PlaceIcon } from './PlaceIcon';
import { RouteChecklistItems, toggleRoute } from './RouteChecklist';
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
  /** Every route, for the suggestions and the full list. */
  routes: Route[];
  /** Routes currently shown on the map. */
  selectedRouteIds: string[];
  onRoutesChange: (routeIds: string[]) => void;
  onSelectStop: (stopId: string) => void;
  onSelectRoute: (routeId: string) => void;
  onSelectPlace: (place: Place) => void;
  /** A place or address found by the geocoder. */
  onSelectLocation: (location: GeocodeResult) => void;
  onShortcut: (shortcut: SearchShortcut) => void;
}

// Collapsed, the bar leaves room for the settings button on the left and the
// style + compass buttons on the right, and is capped at 36rem when centered.
const COLLAPSED_LEFT = 'max(4rem, calc(50% - 18rem))';
const COLLAPSED_RIGHT = 'max(7rem, calc(50% - 18rem))';

/** How many trolleybuses and how many buses are suggested under the empty field. */
const SUGGESTED_PER_TYPE = 3;

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
  routes: allKnownRoutes,
  selectedRouteIds,
  onRoutesChange,
  onSelectStop,
  onSelectRoute,
  onSelectPlace,
  onSelectLocation,
  onShortcut,
}: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TransportType | null>(null);
  // "View more": the full, filterable route list instead of the search results.
  const [browsing, setBrowsing] = useState(false);
  const [browseType, setBrowseType] = useState<TransportType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { data, loading } = useSearch(query);
  const locations = useGeocode(query);

  const hasQuery = query.trim() !== '';
  const showResults = expanded && hasQuery;
  const showBrowse = expanded && browsing && !hasQuery;
  const suggested = (['trolleybus', 'bus'] as const).flatMap((t) =>
    allKnownRoutes.filter((r) => r.type === t).slice(0, SUGGESTED_PER_TYPE),
  );
  const browseRoutes = allKnownRoutes.filter((r) => browseType === null || r.type === browseType);
  const toggle = (id: string) => onRoutesChange(toggleRoute(selectedRouteIds, id));
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
    setBrowsing(false);
    setBrowseType(null);
    inputRef.current?.blur();
    onExpandedChange(false);
  };

  // The back arrow and Escape step out of the full list first, then close the search.
  const back = () => (browsing && !hasQuery ? setBrowsing(false) : close());

  const pick = (fn: () => void) => {
    fn();
    close();
  };

  // With nothing typed there is nothing to keep open: a click outside collapses the bar.
  useEffect(() => {
    if (!expanded || hasQuery || browsing) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // `close` only uses stable setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hasQuery, browsing]);

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
              onClick={back}
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
              if (e.key === 'Escape') back();
              if (e.key === 'Enter') {
                if (routes[0]) pick(() => onSelectRoute(routes[0].id));
                else if (stops[0]) pick(() => onSelectStop(stops[0].id));
                else if (foundPlaces[0]) pick(() => onSelectPlace(foundPlaces[0]));
                else if (locations[0]) pick(() => onSelectLocation(locations[0]));
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

        {expanded && !hasQuery && !browsing && (
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
                icon={<PlaceIcon kind="custom" icon={p.icon} className="h-4 w-4" />}
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

        {expanded && !hasQuery && !browsing && suggested.length > 0 && (
          <div className={`mt-1 overflow-hidden rounded-2xl shadow-lg ${surface}`}>
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <h2 className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}>Routes</h2>
              {selectedRouteIds.length > 0 && (
                <button
                  className={`text-xs underline-offset-2 hover:underline ${mutedText}`}
                  onClick={() => onRoutesChange([])}
                >
                  Clear ({selectedRouteIds.length})
                </button>
              )}
            </div>
            <ul>
              <RouteChecklistItems
                routes={suggested}
                selectedRouteIds={selectedRouteIds}
                onToggle={toggle}
              />
            </ul>
            <div className="flex border-t border-ink-200 dark:border-ink-700">
              <button
                className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-sm font-medium ${hoverRow}`}
                onClick={() => setBrowsing(true)}
              >
                View more routes
                <TbChevronRight className="h-4 w-4" />
              </button>
              {selectedRouteIds.length > 0 && (
                <button
                  className="border-l border-ink-200 px-4 text-sm font-semibold hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-700"
                  onClick={close}
                >
                  Show {selectedRouteIds.length}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`fixed inset-0 z-[999] flex flex-col bg-ink-50 pt-20 transition-opacity duration-300 dark:bg-ink-900 ${
          showBrowse ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        inert={!showBrowse}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4">
          <TypeFilter value={browseType} onChange={setBrowseType} showLabels className="pb-3 pt-3" />
          <ul className={`min-h-0 flex-1 overflow-y-auto rounded-2xl ${surface}`}>
            <RouteChecklistItems
              routes={browseRoutes}
              selectedRouteIds={selectedRouteIds}
              onToggle={toggle}
              roomy
            />
          </ul>
          <div className="flex items-center gap-3 py-4">
            <button
              className="flex-1 rounded-full bg-ink-900 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-ink-900"
              onClick={close}
            >
              {selectedRouteIds.length > 0
                ? `Show ${selectedRouteIds.length} route${selectedRouteIds.length === 1 ? '' : 's'}`
                : 'Done'}
            </button>
            {selectedRouteIds.length > 0 && (
              <button
                className="rounded-full px-4 py-2.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-700"
                onClick={() => onRoutesChange([])}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[999] overflow-y-auto bg-ink-50 pt-20 transition-opacity duration-300 dark:bg-ink-900 ${
          showResults ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        inert={!showResults}
      >
        <div className="mx-auto max-w-2xl px-4 pb-8">
          {!data && loading && <p className={`px-4 py-6 text-sm ${mutedText}`}>Searching…</p>}

          {data && allRoutes.length + stops.length + foundPlaces.length + locations.length === 0 && (
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
                    <PlaceIcon kind={p.kind} icon={p.icon} className="h-5 w-5 shrink-0 text-ink-400" />
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

          {locations.length > 0 && (
            <Section title={`Addresses and places · ${locations.length}`}>
              {locations.map((l) => (
                <li key={`${l.label}-${l.lat}-${l.lng}`}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hoverRow}`}
                    onClick={() => pick(() => onSelectLocation(l))}
                  >
                    <TbMapPin className="h-5 w-5 shrink-0 text-ink-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.label}</span>
                      {l.detail && (
                        <span className={`block truncate text-xs ${mutedText}`}>{l.detail}</span>
                      )}
                    </span>
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
