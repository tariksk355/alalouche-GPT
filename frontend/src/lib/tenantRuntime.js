const TENANT_SLUG_HINT_KEY = 'saas:tenant_slug_hint';
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

let currentTenantSlug = null;

function normalizeSlug(value) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized || null;
}

function shouldUseStoredSlugHint() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (import.meta.env.DEV) {
    return true;
  }

  return LOCALHOST_HOSTNAMES.has(window.location.hostname);
}

function readStoredSlugHint() {
  if (!shouldUseStoredSlugHint()) {
    return null;
  }

  try {
    return normalizeSlug(localStorage.getItem(TENANT_SLUG_HINT_KEY));
  } catch {
    return null;
  }
}

function writeStoredSlugHint(slug) {
  if (!shouldUseStoredSlugHint()) {
    return;
  }

  try {
    if (!slug) {
      localStorage.removeItem(TENANT_SLUG_HINT_KEY);
      return;
    }
    localStorage.setItem(TENANT_SLUG_HINT_KEY, slug);
  } catch {
    // noop: localStorage might be unavailable in constrained environments.
  }
}

function readSlugFromUrl() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const querySlug = normalizeSlug(params.get('restaurantSlug') || params.get('slug'));
  if (querySlug) return querySlug;

  const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9-]+)/);
  if (pathMatch?.[1]) return normalizeSlug(pathMatch[1]);

  return null;
}

export function getTenantSlugHint() {
  return readSlugFromUrl() || currentTenantSlug || readStoredSlugHint();
}

export function setCurrentTenantSlug(slug) {
  currentTenantSlug = normalizeSlug(slug);
  writeStoredSlugHint(currentTenantSlug);
}

export function getCurrentTenantSlug() {
  return readSlugFromUrl() || currentTenantSlug || readStoredSlugHint();
}

export function getTenantRequestHeaders() {
  const slug = getTenantSlugHint();
  if (!slug) return {};
  return { 'x-restaurant-slug': slug };
}
