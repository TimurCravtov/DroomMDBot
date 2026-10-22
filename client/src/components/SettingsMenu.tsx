import { useState } from 'react';
import type { ThemePreference } from '../hooks/useTheme';
import { mutedText, roundButton, surface } from './ui';

interface Props {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
];

/** Gear button that opens a small settings panel. */
export function SettingsMenu({ theme, onThemeChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        className={roundButton}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        </svg>
      </button>

      {open && (
        <div className={`absolute bottom-0 right-12 w-52 rounded-2xl p-3 shadow-lg ${surface}`}>
          <h2 className={`mb-2 text-xs font-medium uppercase tracking-wide ${mutedText}`}>Theme</h2>
          <div role="radiogroup" aria-label="Theme" className="flex rounded-full bg-ink-100 p-0.5 dark:bg-ink-900">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={t.id === theme}
                onClick={() => onThemeChange(t.id)}
                className={`flex-1 rounded-full px-2 py-1 text-sm ${
                  t.id === theme
                    ? 'bg-white font-semibold shadow dark:bg-ink-700'
                    : `${mutedText} hover:text-ink-800 dark:hover:text-ink-100`
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
