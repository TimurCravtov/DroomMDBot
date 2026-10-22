import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function load(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'system';
}

function apply(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(load);

  useEffect(() => {
    apply(preference);
    if (preference !== 'system') return;
    const query = matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const update = (next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return { preference, setPreference: update };
}
