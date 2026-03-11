import { getDeviceMe, getReceiverOrders, updateOrderStatus } from '../api/receiverApi.js';
import { tokenStore } from '../storage/tokenStore.js';

function isAuthError(error) {
  return error?.code === 'DEVICE_TOKEN_INVALID' || error?.code === 'DEVICE_AUTH_REQUIRED' || error?.status === 401;
}

export async function validateDeviceSession() {
  const token = tokenStore.get();
  if (!token) {
    return { state: 'not_paired', device: null, error: null };
  }

  try {
    const device = await getDeviceMe(token);
    return { state: 'validated', device, error: null };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { state: 'not_paired', device: null, error: 'Périphérique non associé ou token invalide.' };
    }

    return { state: 'server_error', device: null, error: error.message || 'Erreur serveur.' };
  }
}

export async function loadOrders() {
  const token = tokenStore.get();
  if (!token) {
    return { state: 'not_paired', orders: [], error: null };
  }

  try {
    const orders = await getReceiverOrders(token);
    return { state: 'loaded', orders, error: null };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { state: 'not_paired', orders: [], error: 'Périphérique non associé ou token invalide.' };
    }

    return { state: 'server_error', orders: [], error: error.message || 'Erreur serveur.' };
  }
}

export async function validateDeviceAndLoadOrders() {
  const validation = await validateDeviceSession();
  if (validation.state !== 'validated') {
    return { state: validation.state, device: validation.device, orders: [], error: validation.error };
  }

  const ordersResult = await loadOrders();
  if (ordersResult.state !== 'loaded') {
    return { state: ordersResult.state, device: validation.device, orders: [], error: ordersResult.error };
  }

  return {
    state: 'loaded',
    device: validation.device,
    orders: ordersResult.orders,
    error: null,
  };
}

export async function changeOrderStatus(orderId, status) {
  const token = tokenStore.get();
  if (!token) {
    return { ok: false, code: 'DEVICE_AUTH_REQUIRED', message: 'Périphérique non associé.' };
  }

  try {
    await updateOrderStatus(token, orderId, status);
    return { ok: true };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { ok: false, code: 'DEVICE_AUTH_REQUIRED', message: 'Session appareil invalide. Réassociez le périphérique.' };
    }

    return { ok: false, code: error.code || 'ORDER_STATUS_UPDATE_FAILED', message: error.message || 'Impossible de mettre à jour la commande.' };
  }
}