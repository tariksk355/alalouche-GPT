import { backendClient } from '@/api/backendClient';
import { getTenantRequestHeaders } from '@/lib/tenantRuntime';

export async function fetchTenantConfig() {
  const headers = getTenantRequestHeaders();

  try {
    const resp = await backendClient.request('/public/restaurant-config', { headers });
    return resp.data;
  } catch (error) {
    const slug = headers['x-restaurant-slug'];
    if (error?.code !== 'TENANT_NOT_RESOLVED' || !slug) {
      throw error;
    }

    const resp = await backendClient.request(`/public/restaurants/${slug}/config`);
    return resp.data;
  }
}
