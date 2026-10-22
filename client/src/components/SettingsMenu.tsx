import { useState } from 'react';
import type { ThemePreference } from '../hooks/useTheme';
import { mutedText, roundButton, surface } from './ui';
import { TbSettings } from 'react-icons/tb';

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
        <TbSettings className="h-6 w-6" />
      </button>

      {open && (
        <div className={`absolute left-0 top-12 w-52 rounded-2xl p-3 shadow-lg ${surface}`}>
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
