import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TbArrowLeft, TbChevronRight, TbDirections, TbMap2, TbMapPin, TbPlus, TbSearch, TbX } from 'react-icons/tb';
import type {
  GeocodeResult,
  Place,
  Route,
  RouteCollection,
  StopSearchResult,
  TransportType,
} from '../api';
import { useLabels } from '../hooks/useLabels';
import { useGeocode, useSearch } from '../hooks/useTransport';
import { useI18n } from '../i18n';
import { PlaceIcon } from './PlaceIcon';
import { RouteChecklistItems } from './RouteChecklist';
import { RouteNumber } from './RouteColors';
import { RoutePills } from './RoutePills';
import { ScrollRow } from './ScrollRow';
import { TypeBadge } from './TypeBadge';
import { TypeFilter } from './TypeFilter';
import { closeButton, hoverRow, mutedText, surface } from './ui';

export type SearchShortcut = 'home' | 'work' | 'add' | 'map' | 'directions';

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
  /** Opens the full Routes panel over the map. */
  onViewMoreRoutes: () => void;
  /** The user's favourite routes: named collections, offered under the empty field. */
  collections: RouteCollection[];
  /** Shows a favourite's routes on the map. */
  onShowCollection: (routeIds: string[]) => void;
  /** Opens the Routes panel on its favourites tab. */
  onViewMoreFavourites: () => void;
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

/** How many favourites are listed under the empty field before "View all favourites". */
const SUGGESTED_FAVOURITES = 3;

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
  onViewMoreRoutes,
  collections,
  onShowCollection,
  onViewMoreFavourites,
  onSelectStop,
  onSelectRoute,
  onSelectPlace,
  onSelectLocation,
  onShortcut,
}: Props) {
  const { t, lower } = useI18n();
  const { placeName } = useLabels();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TransportType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { data, loading } = useSearch(query);
  const locations = useGeocode(query);

  const hasQuery = query.trim() !== '';
  const showResults = expanded && hasQuery;
  const suggested = (['trolleybus', 'bus'] as const).flatMap((t) =>
    allKnownRoutes.filter((r) => r.type === t).slice(0, SUGGESTED_PER_TYPE),
  );
  const routesById = new Map(allKnownRoutes.map((r) => [r.id, r]));
  // Favourites whose routes the feed no longer has would open an empty map: leave them out.
  const favourites = collections
    .map((c) => ({ collection: c, routes: c.routeIds.flatMap((id) => routesById.get(id) ?? []) }))
    .filter((f) => f.routes.length > 0);
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
              aria-label={t('search.close')}
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
            placeholder={t('search.placeholder')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => onExpandedChange(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
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
              aria-label={t('search.clear')}
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
          <ScrollRow className="-mx-1 px-1 pb-2 pt-2">
            <Chip
              icon={<TbDirections className="h-4 w-4" />}
              label={t('directions.title')}
              onClick={() => pick(() => onShortcut('directions'))}
            />
            <Chip
              icon={<PlaceIcon kind="home" className="h-4 w-4" />}
              label={t('place.home')}
              hint={home ? undefined : t('shortcut.set')}
              onClick={() => pick(() => (home ? onSelectPlace(home) : onShortcut('home')))}
            />
            <Chip
              icon={<PlaceIcon kind="work" className="h-4 w-4" />}
              label={t('place.work')}
              hint={work ? undefined : t('shortcut.set')}
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
              label={t('shortcut.add')}
              onClick={() => pick(() => onShortcut('add'))}
            />
            <Chip
              icon={<TbMap2 className="h-4 w-4" />}
              label={t('shortcut.map')}
              onClick={() => pick(() => onShortcut('map'))}
            />
          </ScrollRow>
        )}

        {expanded && !hasQuery && (favourites.length > 0 || suggested.length > 0) && (
          <div className="mt-1 max-h-[calc(100dvh-8.5rem)] space-y-2 overflow-y-auto">
            {favourites.length > 0 && (
              <div className={`overflow-hidden rounded-2xl shadow-lg ${surface}`}>
                <h2
                  className={`px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {t('search.favourites')}
                </h2>
                <ul>
                  {favourites.slice(0, SUGGESTED_FAVOURITES).map(({ collection, routes }) => (
                    <li key={collection.id}>
                      <button
                        className={`w-full px-4 py-2.5 text-left ${hoverRow}`}
                        onClick={() => pick(() => onShowCollection(routes.map((r) => r.id)))}
                      >
                        <span className="block truncate text-sm font-semibold">{collection.name}</span>
                        <RoutePills routes={routes} />
                      </button>
                    </li>
                  ))}
                </ul>
                {favourites.length > SUGGESTED_FAVOURITES && (
                  <div className="flex border-t border-ink-200 dark:border-ink-700">
                    <button
                      className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-sm font-medium ${hoverRow}`}
                      onClick={() => pick(onViewMoreFavourites)}
                    >
                      {t('search.viewMoreFavourites')}
                      <TbChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {suggested.length > 0 && (
              <div className={`overflow-hidden rounded-2xl shadow-lg ${surface}`}>
                <div className="flex items-center justify-between px-4 pb-1 pt-3">
                  <h2 className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}>
                    {t('section.routes')}
                  </h2>
                  {selectedRouteIds.length > 0 && (
                    <button
                      className={`text-xs underline-offset-2 hover:underline ${mutedText}`}
                      onClick={() => onRoutesChange([])}
                    >
                      {t('search.clearCount', { count: selectedRouteIds.length })}
                    </button>
                  )}
                </div>
                <ul>
                  {/* Tapping a suggestion picks that route and leaves the search for the map;
                      choosing several is what "View more routes" is for. */}
                  <RouteChecklistItems
                    routes={suggested}
                    selectedRouteIds={selectedRouteIds}
                    onPick={(id) => pick(() => onSelectRoute(id))}
                  />
                </ul>
                <div className="flex border-t border-ink-200 dark:border-ink-700">
                  <button
                    className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-sm font-medium ${hoverRow}`}
                    onClick={() => pick(onViewMoreRoutes)}
                  >
                    {t('search.viewMore')}
                    <TbChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
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
          {!data && loading && <p className={`px-4 py-6 text-sm ${mutedText}`}>{t('search.searching')}</p>}

          {data && allRoutes.length + stops.length + foundPlaces.length + locations.length === 0 && (
            <p className={`px-4 py-6 text-sm ${mutedText}`}>
              {t('search.noResults', { query: query.trim() })}
            </p>
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
              {t('search.noTypeMatch', { type: lower(t(`type.${type}`)), query: query.trim() })}
            </p>
          )}

          {foundPlaces.length > 0 && (
            <Section title={`${t('section.places')} · ${foundPlaces.length}`}>
              {foundPlaces.map((p) => (
                <li key={p.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hoverRow}`}
                    onClick={() => pick(() => onSelectPlace(p))}
                  >
                    <PlaceIcon kind={p.kind} icon={p.icon} className="h-5 w-5 shrink-0 text-ink-400" />
                    <span className="truncate text-sm font-medium">{placeName(p)}</span>
                  </button>
                </li>
              ))}
            </Section>
          )}

          {routes.length > 0 && (
            <Section title={`${t('section.routes')} · ${routes.length}`}>
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
            <Section title={`${t('section.addresses')} · ${locations.length}`}>
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
            <Section title={`${t('section.stops')} · ${stops.length}`}>
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
                        {t('stop.routes', { numbers: s.routeNumbers.join(', ') })}
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
