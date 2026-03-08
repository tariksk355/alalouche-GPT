import { debugLog } from '@/lib/api/debug';

const DEVICE_TOKEN_KEY = 'device_access_token';

// Web fallback storage adapter.
// Keep this module boundary stable so a Sunmi/native secure storage adapter can replace it later.

export function getDeviceToken() {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setDeviceToken(token) {
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  debugLog('token_stored');
}

export function clearDeviceToken() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  debugLog('token_cleared');
}
