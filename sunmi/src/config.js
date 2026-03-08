export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const POLL_INTERVAL_MS = 5000;
export const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_SUNMI === 'true';
