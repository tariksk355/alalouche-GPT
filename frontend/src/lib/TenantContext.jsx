import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchTenantConfig } from '@/lib/tenantConfig';
import { setCurrentTenantSlug } from '@/lib/tenantRuntime';

const FALLBACK_TENANT = {
  name: 'Restaurant',
  slug: 'default',
  status: 'active',
  branding: {
    logoUrl: null,
    primaryColor: '#b5122a',
  },
  contactInfo: {
    phone: null,
    email: null,
    addressLine1: null,
    city: null,
    postalCode: null,
  },
  locale: 'fr-CH',
  timezone: 'Europe/Zurich',
  currency: 'CHF',
  capabilities: {},
  orderingSettings: {},
  reservationSettings: {},
};

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [tenantError, setTenantError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsLoadingTenant(true);
      setTenantError(null);

      try {
        const data = await fetchTenantConfig();
        const restaurant = data?.restaurant;
        if (!restaurant) {
          throw new Error('Restaurant config unavailable.');
        }

        const normalized = {
          ...FALLBACK_TENANT,
          ...restaurant,
          branding: { ...FALLBACK_TENANT.branding, ...(restaurant.branding || {}) },
          contactInfo: { ...FALLBACK_TENANT.contactInfo, ...(restaurant.contactInfo || {}) },
          capabilities: { ...FALLBACK_TENANT.capabilities, ...(restaurant.capabilities || {}) },
          orderingSettings: { ...FALLBACK_TENANT.orderingSettings, ...(restaurant.orderingSettings || {}) },
          reservationSettings: { ...FALLBACK_TENANT.reservationSettings, ...(restaurant.reservationSettings || {}) },
        };

        setCurrentTenantSlug(normalized.slug);

        if (!cancelled) {
          setTenant(normalized);
        }
      } catch (error) {
        if (!cancelled) {
          setTenantError(error);
          setTenant(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTenant(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      tenant,
      isLoadingTenant,
      tenantError,
      isTenantUnavailable: Boolean(tenantError) || (tenant && tenant.status !== 'active'),
    }),
    [tenant, isLoadingTenant, tenantError],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
