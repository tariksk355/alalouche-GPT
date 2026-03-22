import { backendClient } from '@/api/backendClient';
import { getLegacyStorageKey, storageKeyFor } from '@/lib/storageKeys';

const CUSTOMER_SESSION_KEY_TYPE = 'customer_session';
const ADMIN_SESSION_KEY_TYPE = 'admin_session';

function readJsonStorage(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function migrateLegacyLocalStorage(type) {
  const newKey = storageKeyFor(type);
  const oldKey = getLegacyStorageKey(type === CUSTOMER_SESSION_KEY_TYPE ? 'customerSession' : 'adminSession');

  const current = readJsonStorage(localStorage, newKey);
  if (current || !oldKey) return current;

  const legacy = readJsonStorage(localStorage, oldKey);
  if (!legacy) return null;

  localStorage.setItem(newKey, JSON.stringify(legacy));
  localStorage.removeItem(oldKey);
  return legacy;
}

export function getStoredCustomerSession() {
  return migrateLegacyLocalStorage(CUSTOMER_SESSION_KEY_TYPE);
}

export function setStoredCustomerSession(session) {
  const newKey = storageKeyFor(CUSTOMER_SESSION_KEY_TYPE);
  localStorage.setItem(newKey, JSON.stringify(session));
}

export function clearStoredCustomerSession() {
  localStorage.removeItem(storageKeyFor(CUSTOMER_SESSION_KEY_TYPE));
  const oldKey = getLegacyStorageKey('customerSession');
  if (oldKey) localStorage.removeItem(oldKey);
}

export function getStoredAdminSession() {
  return migrateLegacyLocalStorage(ADMIN_SESSION_KEY_TYPE);
}

export function setStoredAdminSession(session) {
  localStorage.setItem(storageKeyFor(ADMIN_SESSION_KEY_TYPE), JSON.stringify(session));
}

export function clearStoredAdminSession() {
  localStorage.removeItem(storageKeyFor(ADMIN_SESSION_KEY_TYPE));
  const oldKey = getLegacyStorageKey('adminSession');
  if (oldKey) localStorage.removeItem(oldKey);
}

export async function loginCustomer(payload) {
  const data = await backendClient.request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setStoredCustomerSession(data.data);
  return data.data;
}

export async function signupCustomer(payload) {
  const data = await backendClient.request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setStoredCustomerSession(data.data);
  return data.data;
}

export async function fetchCustomerMe(token) {
  const data = await backendClient.request('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return data.data.customer;
}

export async function updateCustomerMe(token, payload) {
  const data = await backendClient.request('/auth/me', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return data.data.customer;
}

export async function verifyCustomerEmail(token) {
  const data = await backendClient.request(`/auth/verify-email?token=${encodeURIComponent(token)}`);
  return data.data;
}

export async function deleteCustomerMe(token) {
  const data = await backendClient.request('/auth/me', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return data.data;
}
