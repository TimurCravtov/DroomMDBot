/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CARTO_API_KEY?: string;
  /** Base URL of the Go server's API. Defaults to /api. */
  readonly VITE_API_URL?: string;
  /** "true" runs on mock data without the server. */
  readonly VITE_USE_MOCK?: string;
}
