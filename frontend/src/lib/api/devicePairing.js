import { requestJson } from './http';
import { debugLog } from './debug';
import { getStoredAdminSession } from '@/lib/customerAuth';

function adminAuthHeaders() {
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

export async function createPairingCode(payload) {
  const data = await requestJson('/admin/device-pairing-codes', {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify(payload),
  });
  debugLog('pairing_code_created', { pairingCodeId: data?.pairingCodeId });
  return data;
}

export async function createPairingRequest(payload) {
  const data = await requestJson('/devices/pairing-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  debugLog('pairing_request_submitted', { pairingRequestId: data?.pairingRequestId });
  return data;
}

export async function listPendingPairingRequests() {
  const data = await requestJson('/admin/device-pairing-requests', {
    headers: adminAuthHeaders(),
  });

  return (data?.requests || []).filter((request) => request.status === 'request_pending');
}

export async function confirmPairingRequest(id) {
  const data = await requestJson(`/admin/device-pairing-requests/${id}/confirm`, {
    method: 'POST',
    headers: adminAuthHeaders(),
  });
  debugLog('pairing_request_confirmed', { pairingRequestId: id });
  return data;
}

export async function verifyDevice(pairingRequestId) {
  try {
    const data = await requestJson('/devices/verify', {
      method: 'POST',
      body: JSON.stringify({ pairingRequestId }),
    });
    debugLog('verify_succeeded', { pairingRequestId, status: data?.status });
    return data;
  } catch (error) {
    debugLog('verify_failed', { pairingRequestId, code: error?.code, message: error?.message });
    throw error;
  }
}
