import { requestJson } from './http.js';
import { debugLog } from '../debug.js';

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getDeviceMe(token) {
  const data = await requestJson('/devices/me', { headers: bearer(token) });
  debugLog('device_validated', { deviceId: data?.id, name: data?.deviceName });
  return data;
}

export async function getReceiverOrders(token) {
  const data = await requestJson('/receiver/orders', { headers: bearer(token) });
  const orders = data?.orders || [];
  debugLog('orders_loaded', { count: orders.length });
  return orders;
}

export async function updateOrderStatus(token, orderId, status) {
  await requestJson(`/receiver/orders/${orderId}/status`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ status }),
  });
  debugLog('order_status_updated', { orderId, status });
}
