import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from './tenant.types';

@Injectable()
export class TenantResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRequestTenant(req: Request): Promise<TenantContext | null> {
    const slugHint = this.getSlugHint(req);
    if (slugHint) {
      const bySlug = await this.prisma.restaurant.findUnique({ where: { slug: slugHint } });
      if (bySlug) return { restaurantId: bySlug.id, slug: bySlug.slug, source: 'slug' };
    }

    const host = this.getHost(req);
    if (!host) return null;

    const byDomain = await this.prisma.restaurant.findUnique({ where: { primaryDomain: host } });
    if (byDomain) return { restaurantId: byDomain.id, slug: byDomain.slug, source: 'domain' };

    const subdomainSlug = this.extractSubdomainSlug(host);
    if (!subdomainSlug) return null;

    const bySubdomain = await this.prisma.restaurant.findUnique({ where: { slug: subdomainSlug } });
    if (!bySubdomain) return null;

    return { restaurantId: bySubdomain.id, slug: bySubdomain.slug, source: 'subdomain' };
  }

  async resolveOrDevFallback(req: Request): Promise<TenantContext | null> {
    const tenant = await this.resolveRequestTenant(req);
    if (tenant) return tenant;

    // If caller explicitly provided a tenant hint but it could not be resolved,
    // never silently fallback to default tenant.
    if (this.hasExplicitTenantHint(req)) {
      return null;
    }

    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    const fallbackRestaurantId = process.env.DEFAULT_RESTAURANT_ID;
    if (!fallbackRestaurantId) {
      return null;
    }

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: fallbackRestaurantId } });
    if (!restaurant) {
      return null;
    }

    return {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      source: 'dev_default',
    };
  }

  private hasExplicitTenantHint(req: Request): boolean {
    return Boolean(
      (req.params?.restaurantSlug as string) ||
        (req.params?.slug as string) ||
        (req.headers['x-restaurant-slug'] as string) ||
        (req.query?.restaurantSlug as string) ||
        (req.query?.slug as string),
    );
  }

  private getSlugHint(req: Request): string | null {
    const paramSlug = this.toSlug((req.params?.restaurantSlug as string) || (req.params?.slug as string));
    if (paramSlug) return paramSlug;

    const headerSlug = this.toSlug((req.headers['x-restaurant-slug'] as string) || undefined);
    if (headerSlug) return headerSlug;

    const querySlug = this.toSlug((req.query?.restaurantSlug as string) || (req.query?.slug as string));
    if (querySlug) return querySlug;

    return null;
  }

  private toSlug(value?: string): string | null {
    const normalized = (value || '').trim().toLowerCase();
    return normalized || null;
  }

  private getHost(req: Request): string | null {
    const raw = ((req.headers['x-forwarded-host'] as string) || req.headers.host || '').trim().toLowerCase();
    if (!raw) return null;
    return raw.split(',')[0].trim().split(':')[0] || null;
  }

  private extractSubdomainSlug(host: string): string | null {
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;

    const configuredBaseDomain = (process.env.TENANT_BASE_DOMAIN || '').trim().toLowerCase();
    if (configuredBaseDomain && host.endsWith(`.${configuredBaseDomain}`)) {
      const subdomain = host.slice(0, -(configuredBaseDomain.length + 1));
      return this.toSlug(subdomain);
    }

    const parts = host.split('.');
    if (parts.length < 3) return null;

    return this.toSlug(parts[0]);
  }
}
