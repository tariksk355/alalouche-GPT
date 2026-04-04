import * as SecureStore from 'expo-secure-store';

const ADMIN_SESSION_KEY = 'operations_admin_session_v1';

export async function loadSession() {
  try {
    const raw = await SecureStore.getItemAsync(ADMIN_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  await SecureStore.setItemAsync(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ADMIN_SESSION_KEY);
}
