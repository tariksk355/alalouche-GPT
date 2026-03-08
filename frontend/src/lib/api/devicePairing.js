import { requestJson } from './http';
import { ADMIN_TOKEN } from './config';
import { debugLog } from './debug';

export async function createPairingCode(payload) {
  const data = await requestJson('/admin/device-pairing-codes', {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN },
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
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });

  return (data?.requests || []).filter((request) => request.status === 'request_pending');
}

export async function confirmPairingRequest(id) {
  const data = await requestJson(`/admin/device-pairing-requests/${id}/confirm`, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN },
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
