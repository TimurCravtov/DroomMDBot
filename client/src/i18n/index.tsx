import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Message, type MessageKey } from './messages/en';
import { ro } from './messages/ro';
import { ru } from './messages/ru';

export type Language = 'en' | 'ro' | 'ru';
/** What the user chose: a language, or "auto" to follow Telegram / the browser. */
export type LanguagePreference = Language | 'auto';

export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'ro', name: 'Română' },
  { id: 'ru', name: 'Русский' },
];

const CATALOGS: Record<Language, Record<MessageKey, Message>> = { en, ro, ru };
const STORAGE_KEY = 'language';

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ro' || value === 'ru';
}

function loadPreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || isLanguage(saved)) return saved;
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'auto';
}

/** "ro-MD" → "ro"; undefined when the code is not one we translate. */
function supported(code: string | undefined): Language | undefined {
  const base = code?.toLowerCase().split(/[-_]/)[0];
  return isLanguage(base) ? base : undefined;
}

/** Telegram's language for the user, then the browser's list in order of preference. */
export function detectLanguage(): Language {
  const candidates = [
    window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code,
    ...(navigator.languages ?? [navigator.language]),
  ];
  for (const code of candidates) {
    const found = supported(code);
    if (found) return found;
  }
  return 'en';
}

const pluralRules = new Map<Language, Intl.PluralRules>();
function pluralCategory(lang: Language, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(lang);
  if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(lang)));
  return rules.select(count);
}

function fill(template: string, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Looks a message up in one language; plural messages pick their form from `count`. */
export function translate(lang: Language, key: MessageKey, params?: Params): string {
  const message = CATALOGS[lang][key] ?? en[key];
  if (typeof message === 'string') return fill(message, params);
  const count = Number(params?.count ?? 0);
  return fill(message[pluralCategory(lang, count)] ?? message.other, params);
}

interface I18n {
  /** The language in use, after resolving "auto". */
  lang: Language;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: Translate;
  /** Lower-cased for the language, for mid-sentence use ("Trolleybus" → "trolleybus"). */
  lower: (text: string) => string;
  /** A number with the language's decimal separator, one decimal place. */
  decimal: (value: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(loadPreference);
  const lang = preference === 'auto' ? detectLanguage() : preference;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const decimalFormat = new Intl.NumberFormat(lang, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return {
      lang,
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
      },
      t: (key, params) => translate(lang, key, params),
      lower: (text) => text.toLocaleLowerCase(lang),
      decimal: (n) => decimalFormat.format(n),
    };
  }, [lang, preference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

export type { MessageKey };
