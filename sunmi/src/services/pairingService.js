import { createPairingRequest, verifyDevice } from '../api/receiverApi.js';
import { tokenStore } from '../storage/tokenStore.js';

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
      installId: crypto.randomUUID(),
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
