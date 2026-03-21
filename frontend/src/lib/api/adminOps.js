import { backendClient } from '@/api/backendClient';
import { getStoredAdminSession } from '@/lib/customerAuth';

function authHeaders() {
  const session = getStoredAdminSession();
  if (!session?.token) {
    const error = new Error('Session admin manquante. Veuillez vous reconnecter.');
    error.code = 'ADMIN_AUTH_REQUIRED';
    throw error;
  }

  return {
    Authorization: `Bearer ${session.token}`,
  };
}

export async function getAdminKpis() {
  const data = await backendClient.request('/admin/kpis', {
    headers: authHeaders(),
  });
  return data.data;
}

export async function listAdminOrders({ includeHidden = false } = {}) {
  const query = includeHidden ? '?includeHidden=true' : '';
  const data = await backendClient.request(`/admin/orders${query}`, {
    headers: authHeaders(),
  });
  return data.data.orders || [];
}

export async function hideAdminOrder(orderId) {
  const data = await backendClient.request(`/admin/orders/${orderId}/hide`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return data.data.order;
}

export async function restoreAdminOrder(orderId) {
  const data = await backendClient.request(`/admin/orders/${orderId}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return data.data.order;
}

export async function updateAdminOrderStatus(orderId, payload) {
  const data = await backendClient.request(`/admin/orders/${orderId}/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.order;
}

export async function listAdminReservations({ includeHidden = false } = {}) {
  const query = includeHidden ? '?includeHidden=true' : '';
  const data = await backendClient.request(`/admin/reservations${query}`, {
    headers: authHeaders(),
  });
  return data.data.reservations || [];
}

export async function hideAdminReservation(reservationId) {
  const data = await backendClient.request(`/admin/reservations/${reservationId}/hide`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return data.data.reservation;
}

export async function restoreAdminReservation(reservationId) {
  const data = await backendClient.request(`/admin/reservations/${reservationId}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return data.data.reservation;
}

export async function updateAdminReservationStatus(reservationId, payload) {
  const data = await backendClient.request(`/admin/reservations/${reservationId}/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.reservation;
}
