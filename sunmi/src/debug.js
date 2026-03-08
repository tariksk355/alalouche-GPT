import { DEBUG_ENABLED } from './config.js';

export function debugLog(event, payload) {
  if (!DEBUG_ENABLED) return;
  if (payload === undefined) {
    console.debug(`[sunmi-receiver] ${event}`);
    return;
  }
  console.debug(`[sunmi-receiver] ${event}`, payload);
}
