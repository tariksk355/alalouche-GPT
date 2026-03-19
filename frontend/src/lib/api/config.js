const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function normalizeBaseUrl(rawValue) {
  return (rawValue || '').trim().replace(/\/$/, '');
}

function normalizeApiPath(path) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function ensureValidProductionApiBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid VITE_API_BASE_URL: ${baseUrl}`);
  }

  if (LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(`VITE_API_BASE_URL cannot point to localhost in production: ${baseUrl}`);
  }
}

function resolveApiBaseUrl() {
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!configured) {
    if (import.meta.env.PROD) {
      throw new Error('Missing VITE_API_BASE_URL for production build/runtime. Frontend and Sunmi builds must bake in the public backend origin.');
    }

    return 'http://localhost:3000';
  }

  if (import.meta.env.PROD) {
    ensureValidProductionApiBaseUrl(configured);
  }

  return configured;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_BASE_URL_SOURCE = 'VITE_API_BASE_URL';
export const API_BASE_URL_DIAGNOSTICS = Object.freeze({
  apiBaseUrl: API_BASE_URL,
  sourceEnvVar: API_BASE_URL_SOURCE,
  mode: import.meta.env.PROD ? 'production' : 'development',
  currentOrigin: typeof window === 'undefined' ? null : window.location.origin,
});
export function buildApiUrl(path) {
  return `${API_BASE_URL}${normalizeApiPath(path)}`;
}
export const ADMIN_TOKEN = import.meta.env.DEV ? (import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin') : (import.meta.env.VITE_ADMIN_TOKEN || '');

if (typeof window !== 'undefined' && (import.meta.env.DEV || import.meta.env.VITE_DEBUG_PAIRING === 'true')) {
  console.info('[api-config] resolved API base URL', API_BASE_URL_DIAGNOSTICS);
}
