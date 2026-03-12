import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminCustomerDto } from './dto/create-admin-customer.dto';
import { UpdateAdminCustomerDto } from './dto/update-admin-customer.dto';

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(restaurantId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        subscribedEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const customerIds = customers.map((customer: (typeof customers)[number]) => customer.id);
    const orderCounts = customerIds.length
      ? await this.prisma.order.groupBy({
          by: ['customerId'],
          where: {
            restaurantId,
            customerId: { in: customerIds },
          },
          _count: { _all: true },
        })
      : [];

    const orderCountByCustomerId = new Map(orderCounts.map((row: (typeof orderCounts)[number]) => [row.customerId, row._count._all]));

    return customers.map((customer: (typeof customers)[number]) => ({
      ...customer,
      orderCount: orderCountByCustomerId.get(customer.id) || 0,
    }));
  }

  async createCustomer(restaurantId: string, dto: CreateAdminCustomerDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.prisma.customer.findUnique({
      where: { restaurantId_email: { restaurantId, email: normalizedEmail } },
    });

    if (existing) {
      throw new ConflictException({ error: 'EMAIL_ALREADY_USED', message: 'Email already registered.' });
    }

    const created = await this.prisma.customer.create({
      data: {
        restaurantId,
        fullName: dto.fullName.trim(),
        email: normalizedEmail,
        phone: dto.phone?.trim() || null,
        passwordHash: hashPassword(dto.password || randomUUID()),
        subscribedEmail: dto.subscribedEmail === true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        subscribedEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ...created, orderCount: 0 };
  }

  async updateCustomer(restaurantId: string, customerId: string, dto: UpdateAdminCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
      select: { id: true, email: true },
    });

    if (!customer) {
      throw new NotFoundException({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
    }

    const nextEmail = dto.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== customer.email) {
      const existing = await this.prisma.customer.findUnique({
        where: { restaurantId_email: { restaurantId, email: nextEmail } },
      });
      if (existing) {
        throw new ConflictException({ error: 'EMAIL_ALREADY_USED', message: 'Email already registered.' });
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(nextEmail !== undefined ? { email: nextEmail } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.subscribedEmail !== undefined ? { subscribedEmail: dto.subscribedEmail } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        subscribedEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const orderCount = await this.prisma.order.count({ where: { restaurantId, customerId } });
    return { ...updated, orderCount };
  }

  async deleteCustomer(restaurantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
    }

    const linkedOrders = await this.prisma.order.count({ where: { restaurantId, customerId } });
    if (linkedOrders > 0) {
      throw new ConflictException({
        error: 'CUSTOMER_HAS_ORDERS',
        message: 'Cannot delete customer with linked orders.',
      });
    }

    await this.prisma.customer.delete({ where: { id: customerId } });
  }
}
