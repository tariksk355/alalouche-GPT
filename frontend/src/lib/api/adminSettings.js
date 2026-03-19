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

export async function getAdminBrandingSettings() {
  const data = await backendClient.request('/admin/settings/branding', {
    headers: authHeaders(),
  });
  return data.data.settings;
}

export async function updateAdminBrandingSettings(payload) {
  const data = await backendClient.request('/admin/settings/branding', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.settings;
}

export async function uploadAdminBrandingLogo(file) {
  const formData = new FormData();
  formData.append('file', file);
  const data = await backendClient.request('/admin/settings/branding/logo-upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return data.data;
}
