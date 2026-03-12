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
