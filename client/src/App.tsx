import { useState } from 'react';
import { ArrivalsPanel } from './components/ArrivalsPanel';
import { SearchBar } from './components/SearchBar';
import { TransitMap } from './components/TransitMap';
import { TYPE_BADGE } from './components/typeStyles';
import { useArrivals, useRoutes, useStops, useVehicles } from './hooks/useTransport';

export function App() {
  const { data: routes = [] } = useRoutes();
  const { data: stops = [] } = useStops();
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);

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
          onSelectStop={setStopId}
        />
      </div>

      {/* Overlays sit above the map canvas and its controls. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col items-center gap-2 p-4">
        <div className="pointer-events-auto w-full max-w-xl">
          <SearchBar
            stops={stops}
            routes={routes}
            onSelectStop={setStopId}
            onSelectRoute={setRouteId}
          />
        </div>

        {selectedRoute && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-2 text-sm shadow-lg ring-1 ring-slate-200">
            <span className="font-bold">{selectedRoute.number}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[selectedRoute.type]}`}>
              {selectedRoute.type}
            </span>
            <span className="text-slate-600">{selectedRoute.name}</span>
            <button
              aria-label="Show all routes"
              className="rounded-full px-2 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setRouteId(null)}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {selectedStop && (
        <div className="absolute inset-x-4 bottom-4 z-[1000] sm:right-auto sm:w-80">
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
