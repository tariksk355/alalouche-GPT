import Constants from 'expo-constants';
import { Alert } from 'react-native';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL
  || Constants.expoConfig?.extra?.apiBaseUrl
  || 'https://app.kodlantis-test.com';

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const url = buildUrl(path);
  if (/^\/admin\/orders\/[^/]+\/status$/.test(path)) {
    Alert.alert('Debug API order status', `url: ${url}
method: ${options.method || 'GET'}
path: ${path}
body: ${options.body || ''}`);
  }

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.code = data.error || `HTTP_${response.status}`;
    throw error;
  }

  return data.data;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function loginAdmin(username, password) {
  return request('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function listOrders(token) {
  const data = await request('/admin/orders?includeOperational=true', { headers: authHeader(token) });
  return Array.isArray(data.orders) ? data.orders : [];
}

export async function listReservations(token) {
  const data = await request('/admin/reservations', { headers: authHeader(token) });
  return Array.isArray(data.reservations) ? data.reservations : [];
}

export async function updateOrderStatus(token, orderId, payload) {
  const data = await request(`/admin/orders/${orderId}/status`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
  return data.order;
}

export async function updateReservationStatus(token, reservationId, payload) {
  const data = await request(`/admin/reservations/${reservationId}/status`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
  return data.reservation;
}

export { API_BASE_URL };
