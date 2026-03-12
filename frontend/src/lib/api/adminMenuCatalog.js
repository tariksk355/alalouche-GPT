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

export async function listAdminMenuCatalog() {
  const data = await backendClient.request('/admin/menu-catalog', {
    headers: authHeaders(),
  });
  return data.data.items || [];
}

export async function createAdminMenuItem(payload) {
  const data = await backendClient.request('/admin/menu-catalog', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.item;
}

export async function updateAdminMenuItem(itemId, payload) {
  const data = await backendClient.request(`/admin/menu-catalog/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.item;
}

export async function deleteAdminMenuItem(itemId) {
  await backendClient.request(`/admin/menu-catalog/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
