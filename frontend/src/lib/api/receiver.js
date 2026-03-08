import { requestJson } from './http';
import { debugLog } from './debug';

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getDeviceMe(token) {
  const data = await requestJson('/devices/me', { headers: authHeader(token) });
  debugLog('device_validated', { deviceId: data?.id, deviceName: data?.deviceName });
  return data;
}

export async function getReceiverOrders(token) {
  const data = await requestJson('/receiver/orders', { headers: authHeader(token) });
  const orders = data?.orders || [];
  debugLog('orders_loaded', { count: orders.length });
  return orders;
}

export async function updateOrderStatus(token, orderId, status) {
  const data = await requestJson(`/receiver/orders/${orderId}/status`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ status }),
  });
  debugLog('order_status_updated', { orderId, status });
  return data;
}
