const DEVICE_TOKEN_KEY = 'device_access_token';

export function getDeviceToken() {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setDeviceToken(token) {
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  console.debug('[pairing] token stored');
}

export function clearDeviceToken() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}

// NOTE: this localStorage implementation is the web fallback.
// Sunmi/native secure storage can replace this module later without changing screens.
