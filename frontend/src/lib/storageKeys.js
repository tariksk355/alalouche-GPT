import { getCurrentTenantSlug } from '@/lib/tenantRuntime';

const LEGACY = {
  customerSession: 'alalouche_customer_session',
  adminSession: 'alalouche_admin',
  cart: 'alalouche_cart',
};

function tenantNamespace() {
  return getCurrentTenantSlug() || 'default';
}

export function storageKeyFor(type) {
  return `saas:${tenantNamespace()}:${type}`;
}

export function getLegacyStorageKey(type) {
  return LEGACY[type] || null;
}
