import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';
import { CreatePairingRequestDto } from './dto/create-pairing-request.dto';

@Injectable()
export class DevicePairingService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureRestaurant(restaurantId: string) {
    const existing = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (existing) {
      return existing;
    }

    return this.prisma.restaurant.create({
      data: {
        id: restaurantId,
        name: 'Default Restaurant (local dev)',
      },
    });
  }

  private generateShortCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private requireAdmin(adminToken?: string) {
    const expected = process.env.ADMIN_TOKEN || 'dev-admin';
    if (adminToken !== expected) {
      throw new UnauthorizedException({ error: 'ADMIN_AUTH_REQUIRED', message: 'Admin token missing or invalid.' });
    }
  }

  async createPairingCode(dto: CreatePairingCodeDto, adminToken?: string) {
    this.requireAdmin(adminToken);

    const code = this.generateShortCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const restaurantId = dto.restaurantId || process.env.DEFAULT_RESTAURANT_ID || 'demo-restaurant';

    await this.ensureRestaurant(restaurantId);

    const pairingCode = await this.prisma.devicePairingCode.create({
      data: {
        code,
        status: 'code_created',
        expiresAt,
        restaurantId,
        createdBy: 'admin_stub',
      },
    });

    return pairingCode;
  }

  async createPairingRequest(dto: CreatePairingRequestDto) {
    const pairingCode = await this.prisma.devicePairingCode.findFirst({
      where: { code: dto.pairingCode.toUpperCase(), status: 'code_created' },
    });

    if (!pairingCode) {
      throw new NotFoundException({ error: 'PAIRING_CODE_NOT_FOUND', message: 'The pairing code is invalid.' });
    }

    if (pairingCode.expiresAt < new Date()) {
      await this.prisma.devicePairingCode.update({ where: { id: pairingCode.id }, data: { status: 'device_expired' } });
      throw new BadRequestException({ error: 'PAIRING_CODE_EXPIRED', message: 'The pairing code has expired.' });
    }

    return this.prisma.devicePairingRequest.create({
      data: {
        pairingCodeId: pairingCode.id,
        restaurantId: pairingCode.restaurantId,
        status: 'request_pending',
        deviceName: dto.deviceName,
        deviceModel: dto.deviceModel,
        platform: dto.platform,
        appVersion: dto.appVersion,
        installId: dto.installId,
      },
    });
  }

  async listRequests(adminToken?: string) {
    this.requireAdmin(adminToken);
    return this.prisma.devicePairingRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async confirmRequest(id: string, adminToken?: string) {
    this.requireAdmin(adminToken);

    const request = await this.prisma.devicePairingRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException({ error: 'PAIRING_REQUEST_NOT_FOUND', message: 'Pairing request not found.' });
    }

    if (request.status !== 'request_pending') {
      throw new BadRequestException({ error: 'PAIRING_REQUEST_INVALID_STATE', message: 'Only pending requests can be confirmed.' });
    }

    const rawToken = randomBytes(48).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const device = await this.prisma.device.create({
      data: {
        restaurantId: request.restaurantId,
        pairingRequestId: request.id,
        deviceName: request.deviceName || 'Sunmi Receiver',
        deviceModel: request.deviceModel,
        platform: request.platform,
        appVersion: request.appVersion,
        installId: request.installId,
        status: 'device_active',
        tokenHash,
      },
    });

    await this.prisma.devicePairingRequest.update({
      where: { id },
      data: { status: 'request_confirmed', confirmedAt: new Date(), tokenIssuedAt: new Date(), plainTokenPreview: rawToken.slice(0, 8) },
    });

    await this.prisma.devicePairingCode.update({ where: { id: request.pairingCodeId }, data: { status: 'request_confirmed' } });

    return { id: request.id, deviceId: device.id };
  }

  async verify(pairingRequestId: string) {
    const request = await this.prisma.devicePairingRequest.findUnique({ where: { id: pairingRequestId } });
    if (!request) {
      throw new NotFoundException({ error: 'PAIRING_REQUEST_NOT_FOUND', message: 'Pairing request not found.' });
    }

    if (request.status === 'request_pending') {
      return { status: 'request_pending' };
    }

    if (request.status === 'request_confirmed') {
      const device = await this.prisma.device.findFirst({ where: { pairingRequestId } });
      if (!device) {
        throw new BadRequestException({ error: 'DEVICE_NOT_READY', message: 'Device activation is not complete.' });
      }

      const rawToken = randomBytes(48).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      await this.prisma.device.update({ where: { id: device.id }, data: { tokenHash, status: 'device_active' } });
      await this.prisma.devicePairingRequest.update({ where: { id: pairingRequestId }, data: { status: 'device_active' } });

      return { status: 'device_active', deviceToken: rawToken };
    }

    return { status: request.status };
  }
}
