import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const DEVICE_LAST_SEEN_REFRESH_MS = 15 * 1000;

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
      where: { tokenHash },
      include: { restaurant: true },
    });

    if (!device) {
      throw new UnauthorizedException({ error: 'DEVICE_TOKEN_INVALID', message: 'Device token is invalid or revoked.' });
    }

    if (device.status !== 'device_active') {
      throw new UnauthorizedException({ error: 'DEVICE_DISSOCIATED', message: 'Device has been dissociated by an administrator.' });
    }

    const now = new Date();
    const lastSeenAtMs = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
    if (!lastSeenAtMs || now.getTime() - lastSeenAtMs >= DEVICE_LAST_SEEN_REFRESH_MS) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: now },
      });
      device.lastSeenAt = now;
    }

    req.device = device;
    return true;
  }
}
