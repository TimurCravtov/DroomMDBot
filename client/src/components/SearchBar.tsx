import { useRef, useState, type ReactNode } from 'react';
import { TbArrowLeft, TbMapPin, TbSearch, TbX } from 'react-icons/tb';
import type { Route, StopSearchResult } from '../api';
import { useSearch } from '../hooks/useTransport';
import { TypeBadge } from './TypeBadge';
import { closeButton, hoverRow, mutedText, surface } from './ui';

interface Props {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectStop: (stopId: string) => void;
  onSelectRoute: (routeId: string) => void;
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

/**
 * Search field that grows to the full width when focused. Once there is a query,
 * the results take over the whole screen (the bar stays on top of them).
 */
export function SearchBar({ expanded, onExpandedChange, onSelectStop, onSelectRoute }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, loading } = useSearch(query);

  const hasQuery = query.trim() !== '';
  const showResults = expanded && hasQuery;
  const routes: Route[] = data?.routes ?? [];
  const stops: StopSearchResult[] = data?.stops ?? [];

  const close = () => {
    setQuery('');
    inputRef.current?.blur();
    onExpandedChange(false);
  };

  const pick = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <>
      <div
        className="absolute top-4 z-[1000] transition-[left,right] duration-500 ease-in-out"
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
            placeholder="Search stops or routes"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => onExpandedChange(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'Enter') {
                if (routes[0]) pick(() => onSelectRoute(routes[0].id));
                else if (stops[0]) pick(() => onSelectStop(stops[0].id));
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
      </div>

      <div
        className={`fixed inset-0 z-[999] overflow-y-auto bg-ink-50 pt-20 transition-opacity duration-300 dark:bg-ink-900 ${
          showResults ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        inert={!showResults}
      >
        <div className="mx-auto max-w-2xl px-4 pb-8">
          {!data && loading && <p className={`px-4 py-6 text-sm ${mutedText}`}>Searching…</p>}

          {data && routes.length + stops.length === 0 && (
            <p className={`px-4 py-6 text-sm ${mutedText}`}>No results for “{query.trim()}”.</p>
          )}

          {routes.length > 0 && (
            <Section title={`Routes · ${routes.length}`}>
              {routes.map((r) => (
                <li key={r.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hoverRow}`}
                    onClick={() => pick(() => onSelectRoute(r.id))}
                  >
                    <span className="w-10 text-lg font-bold">{r.number}</span>
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
