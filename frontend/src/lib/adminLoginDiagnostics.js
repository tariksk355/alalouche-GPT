const ADMIN_LOGIN_DIAGNOSTICS_KEY = 'admin_login_diagnostics_v1';
const MAX_ENTRIES = 25;

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readEntries(storage) {
  if (!storage) return [];

  try {
    const raw = storage.getItem(ADMIN_LOGIN_DIAGNOSTICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordAdminLoginDiagnostic(step, details = {}) {
  const entry = {
    step,
    details,
    path: typeof window === 'undefined' ? null : window.location.pathname,
    at: new Date().toISOString(),
  };

  const storage = getStorage();
  if (storage) {
    const entries = readEntries(storage);
    entries.push(entry);
    storage.setItem(ADMIN_LOGIN_DIAGNOSTICS_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  }

  if (details && Object.keys(details).length > 0) {
    console.info('[admin-auth]', step, details);
    return;
  }

  console.info('[admin-auth]', step);
}

export function clearAdminLoginDiagnostics() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(ADMIN_LOGIN_DIAGNOSTICS_KEY);
}

export { ADMIN_LOGIN_DIAGNOSTICS_KEY };
