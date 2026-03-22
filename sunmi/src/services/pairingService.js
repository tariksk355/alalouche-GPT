import { createPairingRequest, verifyDevice } from '../api/receiverApi.js';
import { tokenStore } from '../storage/tokenStore.js';

const DEVICE_INSTALL_ID_STORAGE_KEY = 'sunmi_receiver_install_id_v1';

function getPersistentInstallId() {
  try {
    const existing = localStorage.getItem(DEVICE_INSTALL_ID_STORAGE_KEY);
    if (existing) return existing;

    const generated = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_INSTALL_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function submitPairingCode(pairingCode) {
  const normalized = (pairingCode || '').trim().toUpperCase();
  if (!normalized) {
    return { ok: false, message: "Veuillez saisir un code d'association." };
  }

  try {
    const data = await createPairingRequest({
      pairingCode: normalized,
      deviceName: 'Sunmi Receiver',
      deviceModel: 'Unknown',
      platform: 'android',
      appVersion: 'v1',
      installId: getPersistentInstallId(),
    });

    return { ok: true, pairingRequestId: data?.pairingRequestId || null };
  } catch (error) {
    return { ok: false, message: error.message || "Impossible de créer la demande d'association." };
  }
}

export async function checkPairingStatus(pairingRequestId) {
  try {
    const data = await verifyDevice(pairingRequestId);

    if (data?.status === 'device_active' && data?.deviceToken) {
      tokenStore.set(data.deviceToken);
      return { status: 'paired' };
    }

    if (data?.status === 'device_expired' || data?.status === 'device_revoked') {
      return { status: 'expired', message: "La demande d'association n'est plus valide." };
    }

    return { status: 'waiting' };
  } catch (error) {
    return { status: 'error', message: error.message || 'Erreur de vérification du pairing.' };
  }
}
