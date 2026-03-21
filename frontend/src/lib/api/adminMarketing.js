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

export async function getAdminMarketingRecipientCount(subscribed = true) {
  const data = await backendClient.request(`/admin/marketing/recipient-count?subscribed=${subscribed ? 'true' : 'false'}`, {
    headers: authHeaders(),
  });

  return Number(data.data.count || 0);
}

export async function listAdminMarketingRecipients(subscribed = true) {
  const data = await backendClient.request(`/admin/marketing/recipients?subscribed=${subscribed ? 'true' : 'false'}`, {
    headers: authHeaders(),
  });

  return data.data.recipients || [];
}

export async function sendAdminMarketingBulkEmail(payload) {
  const data = await backendClient.request('/admin/marketing/send-bulk-email', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  return data.data;
}

export async function listAdminPromotions({ search = '', status = 'all' } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);

  const query = params.toString();
  const data = await backendClient.request(`/admin/marketing/promotions${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });

  return data.data.promotions || [];
}

export async function createAdminPromotion(payload) {
  const data = await backendClient.request('/admin/marketing/promotions', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  return data.data.promotion;
}

export async function updateAdminPromotion(promotionId, payload) {
  const data = await backendClient.request(`/admin/marketing/promotions/${encodeURIComponent(promotionId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  return data.data.promotion;
}
