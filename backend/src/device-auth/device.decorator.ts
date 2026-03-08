import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const DeviceCtx = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest();
  return req.device;
});
