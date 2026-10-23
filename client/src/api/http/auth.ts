/** The slice of Telegram's Mini App SDK that this app uses. */
interface TelegramWebApp {
  /** Signed launch data; empty when the page is not opened inside Telegram. */
  initData: string;
  /** The same data, unverified: fine for the interface language, never for identity. */
  initDataUnsafe?: { user?: { language_code?: string } };
  ready(): void;
  expand(): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const TOKEN_KEY = 'anonymousToken';
let memoryToken: string | undefined;

/** 24 random bytes as 32 URL-safe characters, the shape the server accepts. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * A secret that identifies this browser to the server when the app runs outside Telegram.
 * Kept in localStorage; if that is unavailable it lives only for the page's lifetime.
 */
function anonymousToken(): string {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = randomToken();
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    return (memoryToken ??= randomToken());
  }
}

/**
 * The Authorization header for per-user API calls: Telegram's signed launch data inside
 * Telegram, otherwise this browser's anonymous token (which the server only honors when
 * anonymous accounts are enabled, e.g. for testing).
 */
export function authorizationHeader(): string {
  const initData = window.Telegram?.WebApp?.initData;
  return initData ? `tma ${initData}` : `anon ${anonymousToken()}`;
}

/** Tells Telegram the page is ready and asks for the full-height view. No-op in a browser. */
export function initTelegram() {
  const app = window.Telegram?.WebApp;
  app?.ready();
  app?.expand();
}
