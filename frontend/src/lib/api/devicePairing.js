import { requestJson } from './http';
import { ADMIN_TOKEN } from './config';

/** @typedef {{ pairingCodeId:string, code:string, expiresAt:string }} PairingCode */
/** @typedef {{ pairingRequestId:string, status:string }} PairingRequestCreateResponse */

export async function createPairingCode(payload) {
  const data = await requestJson('/admin/device-pairing-codes', {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN },
    body: JSON.stringify(payload),
  });
  console.debug('[pairing] pairing code created', data?.pairingCodeId);
  return data;
}

export async function createPairingRequest(payload) {
  const data = await requestJson('/devices/pairing-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  console.debug('[pairing] request submitted', data?.pairingRequestId);
  return data;
}

export async function listPendingPairingRequests() {
  const data = await requestJson('/admin/device-pairing-requests', {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });
  const requests = (data?.requests || []).filter((request) => request.status === 'request_pending');
  return requests;
}

export async function confirmPairingRequest(id) {
  const data = await requestJson(`/admin/device-pairing-requests/${id}/confirm`, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });
  console.debug('[pairing] request confirmed', id);
  return data;
}

export async function verifyDevice(pairingRequestId) {
  const data = await requestJson('/devices/verify', {
    method: 'POST',
    body: JSON.stringify({ pairingRequestId }),
  });
  console.debug('[pairing] verify response received', data?.status);
  return data;
}
