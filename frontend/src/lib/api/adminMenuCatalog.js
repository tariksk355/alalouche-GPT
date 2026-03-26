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

export async function uploadAdminMenuImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const data = await backendClient.request('/admin/menu-catalog/images/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return data.data;
}

export async function getAdminMenuCategoryOrder() {
  const data = await backendClient.request('/admin/menu-catalog/categories/order', {
    headers: authHeaders(),
  });
  return Array.isArray(data?.data?.categoryOrder) ? data.data.categoryOrder : [];
}

export async function updateAdminMenuCategoryOrder(categoryOrder) {
  const data = await backendClient.request('/admin/menu-catalog/categories/order', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ categoryOrder }),
  });
  return Array.isArray(data?.data?.categoryOrder) ? data.data.categoryOrder : [];
}

export async function deleteAdminMenuCategory(payload) {
  const data = await backendClient.request('/admin/menu-catalog/categories/delete', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data;
}
