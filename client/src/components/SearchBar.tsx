import { useMemo, useState } from 'react';
import type { Route, Stop } from '../api';
import { TYPE_BADGE } from './typeStyles';
import { hoverRow, mutedText, surface } from './ui';

interface Props {
  stops: Stop[];
  routes: Route[];
  onSelectStop: (stopId: string) => void;
  onSelectRoute: (routeId: string) => void;
}

/** Lowercase and strip diacritics so "piata" matches "Piața". */
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function SearchBar({ stops, routes, onSelectStop, onSelectRoute }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const { matchedRoutes, matchedStops } = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return { matchedRoutes: [], matchedStops: [] };
    return {
      matchedRoutes: routes.filter((r) => normalize(`${r.number} ${r.name}`).includes(q)),
      matchedStops: stops.filter((s) => normalize(s.name).includes(q)),
    };
  }, [query, stops, routes]);

  const hasResults = matchedRoutes.length + matchedStops.length > 0;
  const showDropdown = open && query.trim() !== '';

  const pick = (fn: () => void) => {
    fn();
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg focus-within:ring-2 focus-within:ring-ink-400 ${surface}`}>
        <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-ink-400" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.48l4.31 4.3a1 1 0 01-1.4 1.42l-4.32-4.31A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          value={query}
          placeholder="Search stops or routes"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
      </div>

      {showDropdown && (
        <ul className={`absolute inset-x-0 top-full mt-2 max-h-80 overflow-y-auto rounded-2xl py-2 shadow-lg ${surface}`}>
          {!hasResults && <li className={`px-4 py-2 text-sm ${mutedText}`}>No matches</li>}

          {matchedRoutes.map((r) => (
            <li key={r.id}>
              {/* onMouseDown fires before the input's blur closes the list */}
              <button
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${hoverRow}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(() => onSelectRoute(r.id));
                }}
              >
                <span className="w-8 font-bold">{r.number}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[r.type]}`}>
                  {r.type}
                </span>
                <span className={`truncate ${mutedText}`}>{r.name}</span>
              </button>
            </li>
          ))}

          {matchedStops.map((s) => (
            <li key={s.id}>
              <button
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${hoverRow}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(() => onSelectStop(s.id));
                }}
              >
                <span className="w-8 text-center text-ink-400">●</span>
                <span className="truncate">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
