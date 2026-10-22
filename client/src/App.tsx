import { useState } from 'react';
import { ArrivalsPanel } from './components/ArrivalsPanel';
import { CompassButton, LocateButton, ZoomButtons } from './components/MapControls';
import { RoutePicker } from './components/RoutePicker';
import { DirectionsPanel } from './components/DirectionsPanel';
import { PickLocation, type PickedLocation, type PickPurpose } from './components/PickLocation';
import { PlaceCard } from './components/PlaceCard';
import { SearchBar, type SearchShortcut } from './components/SearchBar';
import { SelectedRoutes } from './components/SelectedRoutes';
import { RouteColorsProvider } from './components/RouteColors';
import { SettingsMenu } from './components/SettingsMenu';
import { StyleSwitcher } from './components/StyleSwitcher';
import { TransitMap } from './components/TransitMap';
import { useTheme } from './hooks/useTheme';
import {
  useArrivals,
  useRoutePaths,
  useRoutes,
  useSavedPlaces,
  useStops,
  useVehicles,
} from './hooks/useTransport';
import { loadMapStyleId, saveMapStyleId, type MapStyleId } from './map/mapStyles';
import type { Itinerary, Place, Route, Stop, Vehicle } from './api';
import { getCurrentLocation } from './map/geolocation';
import type { Endpoint, UserLocation } from './map/types';

export function App() {
  const { data: routes = [] } = useRoutes();
  const { data: stops = [] } = useStops();
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [stopId, setStopId] = useState<string | null>(null);
  const { places, save: savePlace, remove: removePlace } = useSavedPlaces();
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  // Set while the user is choosing a point on the map; says what the point is for.
  const [pickPurpose, setPickPurpose] = useState<PickPurpose | null>(null);
  // Journey planning: the two ends (null = the panel is closed) and the itinerary drawn.
  const [directions, setDirections] = useState<{ from: Endpoint | null; to: Endpoint | null } | null>(
    null,
  );
  const [plannedItinerary, setPlannedItinerary] = useState<Itinerary | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(loadMapStyleId);

  const changeMapStyle = (id: MapStyleId) => {
    setMapStyleId(id);
    saveMapStyleId(id);
  };

  const vehicles = useVehicles(routeIds);
  const routePaths = useRoutePaths(routeIds);
  const { data: arrivals, error } = useArrivals(stopId);

  const selectedStop = stops.find((s) => s.id === stopId) ?? null;
  const selectedRoutes = routeIds
    .map((id) => routes.find((r) => r.id === id))
    .filter((r): r is Route => !!r);

  const picking = pickPurpose !== null;
  const directionsOpen = directions !== null;

  // Stops and places are mutually exclusive selections: only one card at a time.
  const selectStop = (id: string | null) => {
    setStopId(id);
    if (id) setFocusedPlace(null);
  };
  const focusPlace = (place: Place) => {
    setStopId(null);
    setFocusedPlace(place);
  };

  /** The device's position as a journey end; also shows it on the map. */
  const myLocationEndpoint = async (): Promise<Endpoint> => {
    const location = await getCurrentLocation();
    setUserLocation(location);
    return { label: 'My location', lat: location.lat, lng: location.lng, kind: 'me' };
  };

  const openDirections = (ends: { from?: Endpoint; to?: Endpoint }) => {
    setDirections({ from: ends.from ?? null, to: ends.to ?? null });
    if (!ends.from) {
      // Start from where the user is, when that can be found; otherwise they choose.
      myLocationEndpoint().then(
        (me) => setDirections((d) => (d && !d.from ? { ...d, from: me } : d)),
        () => {},
      );
    }
  };

  const closeDirections = () => {
    setDirections(null);
    setPlannedItinerary(null);
  };

  const handleShortcut = (shortcut: SearchShortcut) => {
    if (shortcut === 'directions') openDirections({});
    else setPickPurpose(shortcut === 'add' ? 'custom' : shortcut === 'map' ? 'pin' : shortcut);
  };

  const confirmPick = async (picked: PickedLocation) => {
    const purpose = pickPurpose;
    setPickPurpose(null);
    if (!purpose) return;
    const { lat, lng } = picked;
    if (purpose === 'from' || purpose === 'to') {
      const endpoint: Endpoint = {
        label: picked.address ?? picked.description,
        lat,
        lng,
        kind: 'map',
      };
      setDirections((d) => ({ from: d?.from ?? null, to: d?.to ?? null, [purpose]: endpoint }));
      return;
    }
    if (purpose === 'pin') {
      focusPlace({ id: 'pin', kind: 'pin', label: 'Dropped pin', lat, lng });
      return;
    }
    const label =
      purpose === 'home'
        ? 'Home'
        : purpose === 'work'
          ? 'Work'
          : picked.name.trim() || picked.address || picked.description;
    focusPlace(
      await savePlace({
        kind: purpose,
        label,
        lat,
        lng,
        address: picked.address ?? undefined,
        icon: purpose === 'custom' ? picked.icon : undefined,
      }),
    );
  };

  const showStopArrivals = (stop: Stop) => selectStop(stop.id);

  // Clicking a vehicle shows its route: it becomes the selection if nothing was
  // selected (which means "all routes"), and is added to it otherwise.
  const selectVehicle = (vehicle: Vehicle) =>
    setRouteIds((ids) => (ids.includes(vehicle.routeId) ? ids : [...ids, vehicle.routeId]));

  // Markers for saved places, plus the temporary dropped pin.
  const mapPlaces = focusedPlace?.kind === 'pin' ? [...places, focusedPlace] : places;

  // While the search bar is expanded or a map point is being picked, the rest fades away.
  const fade = (hide: boolean) =>
    `transition-opacity duration-300 ${hide ? 'pointer-events-none opacity-0' : ''}`;
  const hideWhenSearching = fade(searchOpen || picking || directionsOpen);
  const hideOnlyWhenSearching = fade(searchOpen);

  return (
    <RouteColorsProvider routes={routes}>
      <div className="relative h-screen w-screen overflow-hidden">
        <div className="absolute inset-0">
          <TransitMap
            stops={stops}
            routes={routes}
            vehicles={vehicles}
            selectedStop={selectedStop}
            itinerary={plannedItinerary}
            selectedRoutes={selectedRoutes}
            routePaths={routePaths}
            userLocation={userLocation}
            mapStyleId={mapStyleId}
            places={mapPlaces}
            focusedPlace={focusedPlace}
            onSelectStop={selectStop}
            onSelectPlace={focusPlace}
            onSelectVehicle={selectVehicle}
          />
        </div>

        <div className={`absolute bottom-10 right-3 z-10 flex items-center gap-2 ${hideOnlyWhenSearching}`}>
          <ZoomButtons />
          <LocateButton onLocated={setUserLocation} />
        </div>

        <div className={`absolute bottom-10 left-3 z-20 ${hideWhenSearching}`}>
          <RoutePicker
            routes={routes}
            selectedRouteIds={routeIds}
            onChange={setRouteIds}
            open={routesOpen}
            onOpenChange={setRoutesOpen}
          />
        </div>

        <div className={`absolute left-4 top-4 z-[1000] ${hideWhenSearching}`}>
          <SettingsMenu theme={theme} onThemeChange={setTheme} />
        </div>

        <div className={`absolute right-4 top-4 z-[1000] flex gap-2 ${hideWhenSearching}`}>
          <StyleSwitcher value={mapStyleId} onChange={changeMapStyle} />
          <CompassButton />
        </div>

        <SearchBar
          expanded={searchOpen}
          onExpandedChange={setSearchOpen}
          hidden={picking || directionsOpen}
          places={places}
          routes={routes}
          selectedRouteIds={routeIds}
          onRoutesChange={setRouteIds}
          onViewMoreRoutes={() => setRoutesOpen(true)}
          onSelectStop={selectStop}
          onSelectPlace={focusPlace}
          onSelectLocation={(l) =>
            focusPlace({
              id: 'pin',
              kind: 'pin',
              label: l.label,
              address: l.detail,
              lat: l.lat,
              lng: l.lng,
            })
          }
          onShortcut={handleShortcut}
          onSelectRoute={(id) => setRouteIds([id])}
        />

        {selectedRoutes.length > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-4 top-[4.75rem] z-[1000] flex justify-center ${hideWhenSearching}`}
          >
            <div className="pointer-events-auto max-w-full">
              <SelectedRoutes
                routes={selectedRoutes}
                onRemove={(id) => setRouteIds((ids) => ids.filter((x) => x !== id))}
                onClear={() => setRouteIds([])}
              />
            </div>
          </div>
        )}

        {selectedStop && (
          <div
            className={`absolute bottom-[5.5rem] left-4 right-4 z-10 sm:right-auto sm:w-80 ${hideWhenSearching}`}
          >
            <ArrivalsPanel
              stop={selectedStop}
              arrivals={arrivals}
              error={error}
              onClose={() => setStopId(null)}
            />
          </div>
        )}

        {focusedPlace && (
          <div
            className={`absolute bottom-[5.5rem] left-4 right-4 z-10 sm:right-auto sm:w-80 ${hideWhenSearching}`}
          >
            <PlaceCard
              place={focusedPlace}
              onClose={() => setFocusedPlace(null)}
              onRemove={
                focusedPlace.kind === 'pin'
                  ? undefined
                  : () => {
                      void removePlace(focusedPlace.id);
                      setFocusedPlace(null);
                    }
              }
              onShowStop={showStopArrivals}
              onDirections={() =>
                openDirections({
                  to: {
                    label: focusedPlace.label,
                    lat: focusedPlace.lat,
                    lng: focusedPlace.lng,
                    kind: 'place',
                  },
                })
              }
            />
          </div>
        )}

        {directions && (
          <DirectionsPanel
            from={directions.from}
            to={directions.to}
            onChange={setDirections}
            places={places}
            hidden={picking}
            onClose={closeDirections}
            onItineraryChange={setPlannedItinerary}
            onUseMyLocation={myLocationEndpoint}
            onPickOnMap={setPickPurpose}
          />
        )}

        {pickPurpose && (
          <PickLocation
            purpose={pickPurpose}
            onConfirm={(picked) => void confirmPick(picked)}
            onCancel={() => setPickPurpose(null)}
          />
        )}
      </div>
    </RouteColorsProvider>
  );
}
