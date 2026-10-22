import { useState } from 'react';
import { ArrivalsPanel } from './components/ArrivalsPanel';
import { CompassButton, LocateButton, ZoomButtons } from './components/MapControls';
import { RoutePicker } from './components/RoutePicker';
import { PickLocation, type PickedLocation } from './components/PickLocation';
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
import type { Place, PlaceKind, Route, Stop, Vehicle } from './api';
import type { UserLocation } from './map/types';

export function App() {
  const { data: routes = [] } = useRoutes();
  const { data: stops = [] } = useStops();
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [stopId, setStopId] = useState<string | null>(null);
  const { places, save: savePlace, remove: removePlace } = useSavedPlaces();
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  // Set while the user is choosing a point on the map; says what the point is for.
  const [pickPurpose, setPickPurpose] = useState<PlaceKind | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Stops and places are mutually exclusive selections: only one card at a time.
  const selectStop = (id: string | null) => {
    setStopId(id);
    if (id) setFocusedPlace(null);
  };
  const focusPlace = (place: Place) => {
    setStopId(null);
    setFocusedPlace(place);
  };

  const handleShortcut = (shortcut: SearchShortcut) =>
    setPickPurpose(shortcut === 'add' ? 'custom' : shortcut === 'map' ? 'pin' : shortcut);

  const confirmPick = async (picked: PickedLocation) => {
    const purpose = pickPurpose;
    setPickPurpose(null);
    if (!purpose) return;
    const { lat, lng } = picked;
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
      await savePlace({ kind: purpose, label, lat, lng, address: picked.address ?? undefined }),
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
  const hideWhenSearching = fade(searchOpen || picking);
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

        <div className={`absolute bottom-10 left-3 z-10 ${hideWhenSearching}`}>
          <RoutePicker routes={routes} selectedRouteIds={routeIds} onChange={setRouteIds} />
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
          hidden={picking}
          places={places}
          routes={routes}
          selectedRouteIds={routeIds}
          onRoutesChange={setRouteIds}
          onSelectStop={selectStop}
          onSelectPlace={focusPlace}
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
            />
          </div>
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
