import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { TenantResolverService } from './tenant-resolver.service';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly tenantResolver: TenantResolverService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tenant = await this.tenantResolver.resolveOrDevFallback(req);

    if (!tenant) {
      throw new NotFoundException({
        error: 'TENANT_NOT_RESOLVED',
        message: 'Unable to resolve restaurant context from host or slug.',
      });
    }

    req.tenant = tenant;
    return true;
  }
}
