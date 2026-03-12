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

export async function listAdminCustomers() {
  const data = await backendClient.request('/admin/customers', { headers: authHeaders() });
  return data.data.customers || [];
}

export async function createAdminCustomer(payload) {
  const data = await backendClient.request('/admin/customers', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.customer;
}

export async function updateAdminCustomer(customerId, payload) {
  const data = await backendClient.request(`/admin/customers/${customerId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return data.data.customer;
}

export async function deleteAdminCustomer(customerId) {
  await backendClient.request(`/admin/customers/${customerId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
