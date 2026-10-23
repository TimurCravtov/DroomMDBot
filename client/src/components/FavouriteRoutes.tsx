import { useState } from 'react';
import { TbArrowLeft, TbCheck, TbPencil, TbPlus, TbSearch, TbTrash, TbX } from 'react-icons/tb';
import type { Route, RouteCollection, TransportType } from '../api';
import { useI18n } from '../i18n';
import { RouteChecklistItems, toggleRoute } from './RouteChecklist';
import { RoutePills } from './RoutePills';
import { collectionMatches, routeMatches } from './routeSearch';
import { TypeFilter } from './TypeFilter';
import { closeButton, hoverRow, mutedText } from './ui';

/** Longest name the server accepts. */
const MAX_NAME = 40;

const primaryButton =
  'flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-ink-900';

interface Props {
  collections: RouteCollection[];
  routes: Route[];
  /** The routes currently shown on the map: offered as a shortcut when building a favourite. */
  selectedRouteIds: string[];
  /** Show a collection's routes on the map. */
  onShow: (routeIds: string[]) => void;
  onSave: (name: string, routeIds: string[]) => Promise<unknown>;
  onUpdate: (collection: RouteCollection) => Promise<unknown>;
  onDelete: (collectionId: string) => Promise<unknown>;
}

/** What the editor is working on: a new favourite (no id) or an existing one. */
interface Draft {
  id?: string;
  name: string;
  routeIds: string[];
}

/**
 * The favourites tab of the routes panel: named collections of routes. Tapping one shows
 * its routes; "New" (and the pencil on a row) opens an editor where the routes are picked
 * from the full list.
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
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const known = new Map(routes.map((r) => [r.id, r]));
  const shown = query.trim()
    ? collections.filter((c) => collectionMatches(c, known, query))
    : collections;

  // Runs a storage call; shows a message instead of failing silently.
  const attempt = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch {
      setError(t('fav.saveError'));
      return false;
    }
  };

  if (draft) {
    return (
      <CollectionEditor
        draft={draft}
        routes={routes}
        selectedRouteIds={selectedRouteIds}
        error={error}
        onCancel={() => {
          setError(null);
          setDraft(null);
        }}
        onSave={async (name, routeIds) => {
          const saved = await attempt(() =>
            draft.id
              ? onUpdate({ id: draft.id, name, routeIds })
              : onSave(name, routeIds),
          );
          if (saved) setDraft(null);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-ink-200 p-2 dark:border-ink-700">
        {collections.length > 0 ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
            <TbSearch className={`h-4 w-4 shrink-0 ${mutedText}`} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('fav.search')}
              aria-label={t('fav.search')}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                aria-label={t('search.clear')}
                className={closeButton}
                onClick={() => setQuery('')}
              >
                <TbX className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <span className="flex-1" />
        )}
        <button
          title={t('fav.newTitle')}
          aria-label={t('fav.newTitle')}
          className={primaryButton}
          onClick={() => setDraft({ name: '', routeIds: [] })}
        >
          <TbPlus className="h-4 w-4" />
          {t('fav.new')}
        </button>
      </div>

      {error && (
        <p role="alert" className="px-3 pt-1.5 text-xs text-red-500">
          {error}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {collections.length > 0 && shown.length === 0 && (
          <li className={`px-4 py-3 text-sm ${mutedText}`}>{t('fav.noMatch')}</li>
        )}
        {collections.length === 0 && (
          <li className={`px-4 py-3 text-sm ${mutedText}`}>{t('fav.empty')}</li>
        )}
        {shown.map((c) => (
          <CollectionRow
            key={c.id}
            collection={c}
            known={known}
            onShow={() => onShow(c.routeIds.filter((id) => known.has(id)))}
            onEdit={() =>
              setDraft({
                id: c.id,
                name: c.name,
                routeIds: c.routeIds.filter((id) => known.has(id)),
              })
            }
            onDelete={() => void attempt(() => onDelete(c.id))}
          />
        ))}
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
  const { t } = useI18n();
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
        <RoutePills routes={present} />
        {present.length === 0 && (
          <span className={`text-xs ${mutedText}`}>{t('fav.gone')}</span>
        )}
      </button>
      <div className="flex items-center gap-0.5 pr-2">
        <button
          aria-label={t('fav.editName', { name: collection.name })}
          title={t('fav.edit')}
          className={closeButton}
          onClick={onEdit}
        >
          <TbPencil className="h-4 w-4" />
        </button>
        <button
          aria-label={t('fav.deleteName', { name: collection.name })}
          title={t('fav.delete')}
          className={closeButton}
          onClick={onDelete}
        >
          <TbTrash className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/**
 * Names a favourite and picks its routes straight from the list of all routes, with the
 * type filter and search of the Routes tab. A shortcut adds whatever is shown on the map.
 */
function CollectionEditor({
  draft,
  routes,
  selectedRouteIds,
  error,
  onSave,
  onCancel,
}: {
  draft: Draft;
  routes: Route[];
  selectedRouteIds: string[];
  error: string | null;
  onSave: (name: string, routeIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(draft.name);
  const [picked, setPicked] = useState(draft.routeIds);
  const [type, setType] = useState<TransportType | null>(null);
  const [query, setQuery] = useState('');

  const q = query.trim();
  const visible = routes.filter(
    (r) => (type === null || r.type === type) && (q === '' || routeMatches(r, q)),
  );
  const missingFromMap = selectedRouteIds.filter((id) => !picked.includes(id));
  const canSave = name.trim() !== '' && picked.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex items-center gap-2 border-b border-ink-200 p-2 dark:border-ink-700"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void onSave(name.trim(), picked);
        }}
      >
        <button
          type="button"
          aria-label={t('fav.backToList')}
          title={t('fav.backToList')}
          className={closeButton}
          onClick={onCancel}
        >
          <TbArrowLeft className="h-5 w-5" />
        </button>
        <input
          autoFocus={!draft.id}
          value={name}
          maxLength={MAX_NAME}
          placeholder={t('fav.namePlaceholder')}
          aria-label={t('fav.collectionName')}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-full bg-ink-100 px-3 py-1.5 text-sm outline-none placeholder:text-ink-400 dark:bg-ink-900"
        />
        <button type="submit" disabled={!canSave} className={primaryButton}>
          <TbCheck className="h-4 w-4" />
          {picked.length > 0 ? t('fav.saveCount', { count: picked.length }) : t('common.save')}
        </button>
      </form>

      {error && (
        <p role="alert" className="px-3 pt-1.5 text-xs text-red-500">
          {error}
        </p>
      )}

      <TypeFilter
        value={type}
        onChange={setType}
        className="border-b border-ink-200 p-2 dark:border-ink-700"
      />

      <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-1.5 dark:border-ink-700">
        <TbSearch className={`h-4 w-4 shrink-0 ${mutedText}`} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('routes.search')}
          aria-label={t('routes.search')}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button aria-label={t('search.clear')} className={closeButton} onClick={() => setQuery('')}>
            <TbX className="h-4 w-4" />
          </button>
        )}
      </div>

      {missingFromMap.length > 0 && (
        <button
          type="button"
          className={`flex items-center gap-2 border-b border-ink-200 px-4 py-2 text-left text-sm font-medium dark:border-ink-700 ${hoverRow}`}
          onClick={() => setPicked((ids) => [...ids, ...missingFromMap])}
        >
          <TbPlus className="h-4 w-4 shrink-0" />
          {t('fav.addSelected', { count: missingFromMap.length })}
        </button>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        <RouteChecklistItems
          routes={visible}
          selectedRouteIds={picked}
          onToggle={(id) => setPicked((ids) => toggleRoute(ids, id))}
        />
        {visible.length === 0 && (
          <li className={`px-4 py-3 text-sm ${mutedText}`}>{t('routes.noMatch')}</li>
        )}
      </ul>
    </div>
  );
}
