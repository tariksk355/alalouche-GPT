import { backendClient } from '@/api/backendClient';
import { getStoredAdminSession } from '@/lib/customerAuth';

function authHeaders() {
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

export async function getAdminPrinterSettings() {
  const data = await backendClient.request('/admin/settings/printer', {
    headers: authHeaders(),
  });
  return data.data.settings;
}

export async function updateAdminPrinterSettings(payload) {
  const data = await backendClient.request('/admin/settings/printer', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.settings;
}
