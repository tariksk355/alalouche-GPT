import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException({ error: 'DEVICE_AUTH_REQUIRED', message: 'Device bearer token is required.' });
    }

    const token = header.substring('Bearer '.length);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const device = await this.prisma.device.findFirst({
      where: { tokenHash, status: 'device_active' },
      include: { restaurant: true },
    });

    if (!device) {
      throw new UnauthorizedException({ error: 'DEVICE_TOKEN_INVALID', message: 'Device token is invalid or revoked.' });
    }

    req.device = device;
    return true;
  }
}
