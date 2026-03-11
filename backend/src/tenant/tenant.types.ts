export interface TenantContext {
  restaurantId: string;
  slug: string | null;
  source: 'domain' | 'subdomain' | 'slug' | 'dev_default';
}

export interface TenantRequestContext {
  tenant?: TenantContext;
}
