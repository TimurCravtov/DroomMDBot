import { useState } from 'react';
import { TbX } from 'react-icons/tb';
import { ArrivalsPanel } from './components/ArrivalsPanel';
import { CompassButton, LocateButton, ZoomButtons } from './components/MapControls';
import { RoutePicker } from './components/RoutePicker';
import { SearchBar } from './components/SearchBar';
import { SettingsMenu } from './components/SettingsMenu';
import { StyleSwitcher } from './components/StyleSwitcher';
import { TransitMap } from './components/TransitMap';
import { TypeBadge } from './components/TypeBadge';
import { closeButton, mutedText, surface } from './components/ui';
import { useTheme } from './hooks/useTheme';
import { useArrivals, useRoutes, useStops, useVehicles } from './hooks/useTransport';
import { loadMapStyleId, saveMapStyleId, type MapStyleId } from './map/mapStyles';
import type { UserLocation } from './map/types';

export function App() {
  const { data: routes = [] } = useRoutes();
  const { data: stops = [] } = useStops();
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(loadMapStyleId);

  const changeMapStyle = (id: MapStyleId) => {
    setMapStyleId(id);
    saveMapStyleId(id);
  };

  const vehicles = useVehicles(routeId);
  const { data: arrivals, error } = useArrivals(stopId);

  const selectedStop = stops.find((s) => s.id === stopId) ?? null;
  const selectedRoute = routes.find((r) => r.id === routeId) ?? null;

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
          selectedRoute={selectedRoute}
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
        <RoutePicker routes={routes} selectedRouteId={routeId} onSelect={setRouteId} />
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
        onSelectRoute={setRouteId}
      />

      {selectedRoute && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-[4.75rem] z-[1000] flex justify-center ${hideWhenSearching}`}
        >
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-4 pr-2 text-sm shadow-lg ${surface}`}
          >
            <span className="font-bold">{selectedRoute.number}</span>
            <TypeBadge type={selectedRoute.type} />
            <span className={mutedText}>{selectedRoute.name}</span>
            <button
              aria-label="Show all routes"
              className={closeButton}
              onClick={() => setRouteId(null)}
            >
              <TbX className="h-5 w-5" />
            </button>
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
