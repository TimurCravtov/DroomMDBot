import { useState } from 'react';
import { ArrivalsPanel } from './components/ArrivalsPanel';
import { CompassButton, LocateButton, ZoomButtons } from './components/MapControls';
import { RoutePicker } from './components/RoutePicker';
import { SearchBar } from './components/SearchBar';
import { SelectedRoutes } from './components/SelectedRoutes';
import { SettingsMenu } from './components/SettingsMenu';
import { StyleSwitcher } from './components/StyleSwitcher';
import { TransitMap } from './components/TransitMap';
import { useTheme } from './hooks/useTheme';
import { useArrivals, useRoutes, useStops, useVehicles } from './hooks/useTransport';
import { loadMapStyleId, saveMapStyleId, type MapStyleId } from './map/mapStyles';
import type { Route } from './api';
import type { UserLocation } from './map/types';

export function App() {
  const { data: routes = [] } = useRoutes();
  const { data: stops = [] } = useStops();
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [stopId, setStopId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(loadMapStyleId);

  const changeMapStyle = (id: MapStyleId) => {
    setMapStyleId(id);
    saveMapStyleId(id);
  };

  const vehicles = useVehicles(routeIds);
  const { data: arrivals, error } = useArrivals(stopId);

  const selectedStop = stops.find((s) => s.id === stopId) ?? null;
  const selectedRoutes = routeIds
    .map((id) => routes.find((r) => r.id === id))
    .filter((r): r is Route => !!r);

  // While the search bar is expanded, everything else fades out of the way.
  const hideWhenSearching = `transition-opacity duration-300 ${
    searchOpen ? 'pointer-events-none opacity-0' : ''
  }`;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <TransitMap
          stops={stops}
          routes={routes}
          vehicles={vehicles}
          selectedStop={selectedStop}
          selectedRoutes={selectedRoutes}
          userLocation={userLocation}
          mapStyleId={mapStyleId}
          onSelectStop={setStopId}
        />
      </div>

      <div className={`absolute bottom-10 right-3 z-10 flex items-center gap-2 ${hideWhenSearching}`}>
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
        onSelectStop={setStopId}
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
    </div>
  );
}
