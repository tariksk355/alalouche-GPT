import { requestJson } from './http';

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getDeviceMe(token) {
  return requestJson('/devices/me', { headers: authHeader(token) });
}

export async function getReceiverOrders(token) {
  const data = await requestJson('/receiver/orders', { headers: authHeader(token) });
  console.debug('[receiver] orders loaded', data?.orders?.length || 0);
  return data?.orders || [];
}

export async function updateOrderStatus(token, orderId, status) {
  return requestJson(`/receiver/orders/${orderId}/status`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ status }),
  });
}
