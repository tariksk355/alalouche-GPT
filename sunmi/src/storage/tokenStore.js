import { debugLog } from '../debug.js';

const DEVICE_TOKEN_KEY = 'device_access_token';

export class LocalStorageTokenStore {
  get() {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  }

  set(token) {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    debugLog('token_stored');
  }

  clear() {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    debugLog('token_cleared');
  }
}

// Adapter boundary for future native secure storage (Android bridge/Sunmi SDK wrappers).
export const tokenStore = new LocalStorageTokenStore();
