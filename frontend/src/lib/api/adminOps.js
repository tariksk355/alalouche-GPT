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

export async function listAdminOrders() {
  const data = await backendClient.request('/admin/orders', {
    headers: authHeaders(),
  });
  return data.data.orders || [];
}

export async function updateAdminOrderStatus(orderId, payload) {
  const data = await backendClient.request(`/admin/orders/${orderId}/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.order;
}

export async function listAdminReservations() {
  const data = await backendClient.request('/admin/reservations', {
    headers: authHeaders(),
  });
  return data.data.reservations || [];
}

export async function updateAdminReservationStatus(reservationId, payload) {
  const data = await backendClient.request(`/admin/reservations/${reservationId}/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.reservation;
}
