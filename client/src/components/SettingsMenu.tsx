import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TbBrandGithub, TbCheck, TbSettings, TbX } from 'react-icons/tb';
import type { ThemePreference } from '../hooks/useTheme';
import { LANGUAGES, useI18n, type LanguagePreference } from '../i18n';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import { closeButton, hoverRow, mutedText, roundButton, surface } from './ui';

const REPO_URL = 'https://github.com/TimurCravtov/DroomMDBot';

interface Props {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  mapStyleId: MapStyleId;
  onMapStyleChange: (id: MapStyleId) => void;
}

const THEMES: ThemePreference[] = ['light', 'dark', 'system'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={`mb-2 px-1 text-xs font-medium uppercase tracking-wide ${mutedText}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A row of mutually exclusive options that share the width, like a segmented control. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-0.5 rounded-2xl bg-ink-100 p-0.5 dark:bg-ink-900"
    >
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={`min-w-[4.5rem] flex-1 rounded-full px-2 py-1.5 text-sm ${
            o.id === value
              ? 'bg-white font-semibold shadow dark:bg-ink-700'
              : `${mutedText} hover:text-ink-800 dark:hover:text-ink-100`
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Gear button that opens the settings panel: a full-height window over the map with the theme, the
 * interface language, the base map and a few words about the app.
 */
export function SettingsMenu({ theme, onThemeChange, mapStyleId, onMapStyleChange }: Props) {
  const { t, preference, setPreference } = useI18n();
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    gearRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        gearRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const languageOptions: { id: LanguagePreference; name: string }[] = [
    { id: 'auto', name: t('language.auto') },
    ...LANGUAGES,
  ];

  return (
    <>
      <button
        ref={gearRef}
        aria-label={t('settings.open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('settings.open')}
        className={roundButton}
        onClick={() => setOpen(true)}
      >
        <TbSettings className="h-6 w-6" />
      </button>

      {/* In the body, so the sheet covers the search bar and the other floating controls. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[2000] flex justify-start">
            <div
              aria-hidden
              className="absolute inset-0 bg-ink-900/40 backdrop-blur-[1px]"
              onClick={close}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              className={`relative flex h-full w-full flex-col shadow-2xl sm:max-w-md sm:rounded-r-3xl ${surface}`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-ink-200 px-5 py-3 dark:border-ink-700">
                <h2 id="settings-title" className="text-lg font-semibold">
                  {t('settings.title')}
                </h2>
                <button
                  ref={closeRef}
                  aria-label={t('common.close')}
                  className={closeButton}
                  onClick={close}
                >
                  <TbX className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-4">
                <Section title={t('settings.appearance')}>
                  <Segmented
                    label={t('settings.theme')}
                    value={theme}
                    options={THEMES.map((id) => ({ id, label: t(`theme.${id}`) }))}
                    onChange={onThemeChange}
                  />
                </Section>

                <Section title={t('settings.language')}>
                  <div
                    role="radiogroup"
                    aria-label={t('settings.language')}
                    className="overflow-hidden rounded-2xl ring-1 ring-ink-200 dark:ring-ink-700"
                  >
                    {languageOptions.map((l, i) => (
                      <button
                        key={l.id}
                        role="radio"
                        aria-checked={l.id === preference}
                        onClick={() => setPreference(l.id)}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${hoverRow} ${
                          i > 0 ? 'border-t border-ink-200 dark:border-ink-700' : ''
                        } ${l.id === preference ? 'font-semibold' : ''}`}
                      >
                        {l.name}
                        {l.id === preference && <TbCheck aria-hidden className="h-4 w-4" />}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title={t('settings.map')}>
                  <Segmented
                    label={t('map.styleTitle')}
                    value={mapStyleId}
                    options={MAP_STYLES.map((s) => ({ id: s.id, label: t(`mapStyle.${s.id}`) }))}
                    onChange={onMapStyleChange}
                  />
                </Section>

                <Section title={t('settings.about')}>
                  <div className={`rounded-2xl p-4 ring-1 ring-ink-200 dark:ring-ink-700`}>
                    <p className="text-sm font-semibold">Droom :: MD</p>
                    <p className={`mt-0.5 text-sm ${mutedText}`}>{t('settings.aboutText')}</p>
                    <a
                      href={REPO_URL}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 ring-ink-200 dark:ring-ink-700 ${hoverRow}`}
                    >
                      <TbBrandGithub className="h-4 w-4" />
                      {t('settings.sourceCode')}
                    </a>
                  </div>
                </Section>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
