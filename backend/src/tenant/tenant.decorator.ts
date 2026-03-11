import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from './tenant.types';

export const TenantCtx = createParamDecorator((_: unknown, context: ExecutionContext): TenantContext | undefined => {
  const req = context.switchToHttp().getRequest();
  return req.tenant;
});
