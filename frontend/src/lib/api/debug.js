const enabled = import.meta.env.VITE_DEBUG_PAIRING === 'true';

export function debugLog(event, payload) {
  if (!enabled) return;
  if (payload === undefined) {
    console.debug(`[slice-debug] ${event}`);
    return;
  }
  console.debug(`[slice-debug] ${event}`, payload);
}
