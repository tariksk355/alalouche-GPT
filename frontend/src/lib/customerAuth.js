import { backendClient } from '@/api/backendClient';

const CUSTOMER_SESSION_KEY = 'alalouche_customer_session';
const ADMIN_SESSION_KEY = 'alalouche_admin';

export function getStoredCustomerSession() {
  const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    return null;
  }
}

export function setStoredCustomerSession(session) {
  localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredCustomerSession() {
  localStorage.removeItem(CUSTOMER_SESSION_KEY);
}

export function getStoredAdminSession() {
  const raw = localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
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