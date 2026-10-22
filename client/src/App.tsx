import { useState } from 'react';
import { ArrivalsPanel } from './components/ArrivalsPanel';
import { CompassButton, LocateButton, ZoomButtons } from './components/MapControls';
import { SearchBar } from './components/SearchBar';
import { SettingsMenu } from './components/SettingsMenu';
import { StyleSwitcher } from './components/StyleSwitcher';
import { TransitMap } from './components/TransitMap';
import { TYPE_BADGE } from './components/typeStyles';
import { useTheme } from './hooks/useTheme';
import { useArrivals, useRoutes, useStops, useVehicles } from './hooks/useTransport';
import { loadMapStyleId, saveMapStyleId, type MapStyleId } from './map/mapStyles';
import type { UserLocation } from './map/types';
import { closeButton, mutedText, surface } from './components/ui';
import { TbX } from 'react-icons/tb';

export function App() {
  const { data: routes = [] } = useRoutes();
  const { data: stops = [] } = useStops();
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
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

      <div className="absolute bottom-10 right-3 z-10 flex items-center gap-2">
        <ZoomButtons />
        <LocateButton onLocated={setUserLocation} />
      </div>

      {/* Top row: settings left, search centered, map style + compass right. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 p-4 md:grid-cols-[1fr_minmax(0,36rem)_1fr]">
        <div className="pointer-events-auto justify-self-start">
          <SettingsMenu theme={theme} onThemeChange={setTheme} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="pointer-events-auto w-full">
            <SearchBar
              stops={stops}
              routes={routes}
              onSelectStop={setStopId}
              onSelectRoute={setRouteId}
            />
          </div>

          {selectedRoute && (
            <div className={`pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-4 pr-2 text-sm shadow-lg ${surface}`}>
              <span className="font-bold">{selectedRoute.number}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[selectedRoute.type]}`}>
                {selectedRoute.type}
              </span>
              <span className={mutedText}>{selectedRoute.name}</span>
              <button
                aria-label="Show all routes"
                className={closeButton}
                onClick={() => setRouteId(null)}
              >
                <TbX className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex gap-2 justify-self-end">
          <StyleSwitcher value={mapStyleId} onChange={changeMapStyle} />
          <CompassButton />
        </div>
      </div>

      {selectedStop && (
        <div className="absolute bottom-[5.5rem] left-4 right-4 z-10 sm:bottom-4 sm:right-auto sm:w-80">
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
