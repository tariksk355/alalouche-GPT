import {
  getDeviceMe,
  getReceiverOrders,
  getReceiverReservations,
  revokeCurrentDevice,
  updateOrderStatus,
  updateReservationStatus,
} from '../api/receiverApi.js';
import { tokenStore } from '../storage/tokenStore.js';

function isAuthError(error) {
  return error?.code === 'DEVICE_TOKEN_INVALID' || error?.code === 'DEVICE_AUTH_REQUIRED' || error?.code === 'DEVICE_DISSOCIATED' || error?.status === 401;
}

export async function validateDeviceSession() {
  const token = tokenStore.get();
  if (!token) {
    return { state: 'not_paired', device: null, error: null };
  }

  try {
    const device = await getDeviceMe(token);
    return { state: 'validated', device, error: null, reason: null };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { state: 'not_paired', device: null, error: error.message || 'Périphérique non associé ou token invalide.', reason: error.code || null };
    }

    return { state: 'server_error', device: null, error: error.message || 'Erreur serveur.', reason: error.code || null };
  }
}

export async function loadOperationalData() {
  const token = tokenStore.get();
  if (!token) {
    return { state: 'not_paired', orders: [], reservations: [], error: null };
  }

  try {
    const [orders, reservations] = await Promise.all([
      getReceiverOrders(token),
      getReceiverReservations(token),
    ]);

    return { state: 'loaded', orders, reservations, error: null, reason: null };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return {
        state: 'not_paired',
        orders: [],
        reservations: [],
        error: error.message || 'Périphérique non associé ou token invalide.',
        reason: error.code || null,
      };
    }

    return { state: 'server_error', orders: [], reservations: [], error: error.message || 'Erreur serveur.', reason: error.code || null };
  }
}

export async function selfUnpairDevice() {
  const token = tokenStore.get();
  if (!token) {
    return { ok: true, alreadyUnpaired: true };
  }

  try {
    await revokeCurrentDevice(token);
    tokenStore.clear();
    return { ok: true, alreadyUnpaired: false };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { ok: true, alreadyUnpaired: true };
    }

    return {
      ok: false,
      code: error.code || 'DEVICE_SELF_REVOKE_FAILED',
      message: error.message || "Impossible de désassocier l'appareil.",
    };
  }
}

export async function changeOrderStatus(orderId, status, prepMinutes) {
  const token = tokenStore.get();
  if (!token) {
    return { ok: false, code: 'DEVICE_AUTH_REQUIRED', message: 'Périphérique non associé.' };
  }

  try {
    const order = await updateOrderStatus(token, orderId, status, prepMinutes);
    return { ok: true, order };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { ok: false, code: 'DEVICE_AUTH_REQUIRED', message: 'Session appareil invalide. Réassociez le périphérique.' };
    }

    return {
      ok: false,
      code: error.code || 'ORDER_STATUS_UPDATE_FAILED',
      message: error.message || 'Impossible de mettre à jour la commande.',
    };
  }
}

export async function changeReservationStatus(reservationId, status) {
  const token = tokenStore.get();
  if (!token) {
    return { ok: false, code: 'DEVICE_AUTH_REQUIRED', message: 'Périphérique non associé.' };
  }

  try {
    const reservation = await updateReservationStatus(token, reservationId, status);
    return { ok: true, reservation };
  } catch (error) {
    if (isAuthError(error)) {
      tokenStore.clear();
      return { ok: false, code: 'DEVICE_AUTH_REQUIRED', message: 'Session appareil invalide. Réassociez le périphérique.' };
    }

    return {
      ok: false,
      code: error.code || 'RESERVATION_STATUS_UPDATE_FAILED',
      message: error.message || 'Impossible de mettre à jour la réservation.',
    };
  }
}
