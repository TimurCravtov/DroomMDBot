import { useState, type FormEvent } from 'react';
import { TbCheck, TbPencil, TbSearch, TbStar, TbTrash, TbX } from 'react-icons/tb';
import type { Route, RouteCollection } from '../api';
import { RouteNumber } from './RouteColors';
import { collectionMatches } from './routeSearch';
import { closeButton, hoverRow, mutedText } from './ui';

/** Longest name the server accepts. */
const MAX_NAME = 40;
/** Route pills shown per collection before "+N". */
const PREVIEW = 8;

interface Props {
  collections: RouteCollection[];
  routes: Route[];
  /** The routes currently shown on the map: what "save" captures. */
  selectedRouteIds: string[];
  /** Show a collection's routes on the map. */
  onShow: (routeIds: string[]) => void;
  onSave: (name: string, routeIds: string[]) => Promise<unknown>;
  onUpdate: (collection: RouteCollection) => Promise<unknown>;
  onDelete: (collectionId: string) => Promise<unknown>;
}

/**
 * The favourites tab of the routes panel: named collections of routes. Tapping one shows
 * its routes; the form at the top saves whatever is selected as a new collection.
 */
export function FavouriteRoutes({
  collections,
  routes,
  selectedRouteIds,
  onShow,
  onSave,
  onUpdate,
  onDelete,
}: Props) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const known = new Map(routes.map((r) => [r.id, r]));
  const shown = query.trim()
    ? collections.filter((c) => collectionMatches(c, known, query))
    : collections;
  const canSave = selectedRouteIds.length > 0 && name.trim() !== '';

  // Runs a storage call; shows a message instead of failing silently.
  const attempt = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch {
      setError('Could not save. Try again.');
      return false;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    if (await attempt(() => onSave(name.trim(), selectedRouteIds))) setName('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={submit}
        className="border-b border-ink-200 p-2 dark:border-ink-700"
        aria-label="Save selected routes as a favourite"
      >
        <div className="flex gap-2">
          <input
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              selectedRouteIds.length > 0 ? 'Name, e.g. To work' : 'Select routes to save them'
            }
            disabled={selectedRouteIds.length === 0}
            className="min-w-0 flex-1 rounded-full bg-ink-100 px-3 py-1.5 text-sm outline-none placeholder:text-ink-400 disabled:opacity-60 dark:bg-ink-900"
          />
          <button
            type="submit"
            disabled={!canSave}
            className="flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-ink-900"
          >
            <TbStar className="h-4 w-4" />
            Save{selectedRouteIds.length > 0 && ` (${selectedRouteIds.length})`}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 px-1 text-xs text-red-500">
            {error}
          </p>
        )}
      </form>

      {collections.length > 0 && (
        <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-1.5 dark:border-ink-700">
          <TbSearch className={`h-4 w-4 shrink-0 ${mutedText}`} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search favourites"
            aria-label="Search favourites"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button aria-label="Clear search" className={closeButton} onClick={() => setQuery('')}>
              <TbX className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {collections.length > 0 && shown.length === 0 && (
          <li className={`px-4 py-3 text-sm ${mutedText}`}>No favourites match your search.</li>
        )}
        {collections.length === 0 && (
          <li className={`px-4 py-3 text-sm ${mutedText}`}>
            No favourites yet. Pick some routes on the Routes tab, then save them here under a name.
          </li>
        )}
        {shown.map((c) =>
          c.id === editingId ? (
            <EditRow
              key={c.id}
              collection={c}
              selectedRouteIds={selectedRouteIds}
              onCancel={() => setEditingId(null)}
              onSave={async (next) => {
                if (await attempt(() => onUpdate(next))) setEditingId(null);
              }}
            />
          ) : (
            <CollectionRow
              key={c.id}
              collection={c}
              known={known}
              onShow={() => onShow(c.routeIds.filter((id) => known.has(id)))}
              onEdit={() => setEditingId(c.id)}
              onDelete={() => void attempt(() => onDelete(c.id))}
            />
          ),
        )}
      </ul>
    </div>
  );
}

function CollectionRow({
  collection,
  known,
  onShow,
  onEdit,
  onDelete,
}: {
  collection: RouteCollection;
  known: Map<string, Route>;
  onShow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Routes the feed no longer has are skipped rather than shown as blanks.
  const present = collection.routeIds.map((id) => known.get(id)).filter((r): r is Route => !!r);

  return (
    <li className="flex items-stretch">
      <button
        className={`min-w-0 flex-1 px-4 py-2.5 text-left ${hoverRow}`}
        disabled={present.length === 0}
        onClick={onShow}
      >
        <span className="block truncate text-sm font-semibold">{collection.name}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {present.slice(0, PREVIEW).map((r) => (
            <RouteNumber key={r.id} routeId={r.id} number={r.number} type={r.type} />
          ))}
          {present.length > PREVIEW && (
            <span className={`self-center text-xs ${mutedText}`}>+{present.length - PREVIEW}</span>
          )}
          {present.length === 0 && (
            <span className={`text-xs ${mutedText}`}>These routes are no longer available.</span>
          )}
        </span>
      </button>
      <div className="flex items-center gap-0.5 pr-2">
        <button
          aria-label={`Edit ${collection.name}`}
          title="Edit"
          className={closeButton}
          onClick={onEdit}
        >
          <TbPencil className="h-4 w-4" />
        </button>
        <button
          aria-label={`Delete ${collection.name}`}
          title="Delete"
          className={closeButton}
          onClick={onDelete}
        >
          <TbTrash className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/** Renames a collection, and can replace its routes with the current selection. */
function EditRow({
  collection,
  selectedRouteIds,
  onSave,
  onCancel,
}: {
  collection: RouteCollection;
  selectedRouteIds: string[];
  onSave: (collection: RouteCollection) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(collection.name);
  const [routeIds, setRouteIds] = useState(collection.routeIds);
  const usingSelection = routeIds === selectedRouteIds;

  return (
    <li className="space-y-2 bg-ink-50 px-4 py-2.5 dark:bg-ink-900">
      <input
        autoFocus
        value={name}
        maxLength={MAX_NAME}
        aria-label="Collection name"
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-full bg-white px-3 py-1.5 text-sm outline-none ring-1 ring-ink-200 dark:bg-ink-800 dark:ring-ink-700"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={selectedRouteIds.length === 0 || usingSelection}
          className={`rounded-full px-3 py-1 text-xs ring-1 ring-ink-300 disabled:opacity-40 dark:ring-ink-600 ${hoverRow}`}
          onClick={() => setRouteIds(selectedRouteIds)}
        >
          {usingSelection
            ? `Using ${selectedRouteIds.length} selected`
            : `Use selected routes (${selectedRouteIds.length})`}
        </button>
        <span className="flex-1" />
        <button aria-label="Cancel" title="Cancel" className={closeButton} onClick={onCancel}>
          <TbX className="h-4 w-4" />
        </button>
        <button
          aria-label="Save changes"
          title="Save"
          disabled={name.trim() === '' || routeIds.length === 0}
          className={`${closeButton} disabled:opacity-40`}
          onClick={() => void onSave({ ...collection, name: name.trim(), routeIds })}
        >
          <TbCheck className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
