import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerSignupDto } from './dto/customer-signup.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { hashPassword, verifyPassword } from './password';
import { AccessTokenPayload, TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async adminLogin(dto: AdminLoginDto) {
    const admin = await this.prisma.adminUser.findUnique({ where: { username: dto.username } });
    if (!admin || !verifyPassword(dto.password, admin.passwordHash)) {
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials.' });
    }

    const token = this.tokenService.sign({
      sub: admin.id,
      role: 'admin',
      restaurantId: admin.restaurantId,
      username: admin.username,
    });

    return {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.displayName,
        restaurantId: admin.restaurantId,
      },
    };
  }

  async customerSignup(restaurantId: string, dto: CustomerSignupDto) {
    const existing = await this.prisma.customer.findUnique({
      where: { restaurantId_email: { restaurantId, email: dto.email.toLowerCase() } },
    });
    if (existing) {
      throw new ConflictException({ error: 'EMAIL_ALREADY_USED', message: 'Email already registered.' });
    }

    const customer = await this.prisma.customer.create({
      data: {
        restaurantId,
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        phone: dto.phone || null,
        subscribedEmail: false,
        passwordHash: hashPassword(dto.password),
      },
    });

    return this.issueCustomerSession(customer.id, customer.restaurantId, customer.email, customer.fullName, customer.phone);
  }

  async customerLogin(restaurantId: string, dto: CustomerLoginDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { restaurantId_email: { restaurantId, email: dto.email.toLowerCase() } },
    });

    if (!customer || !verifyPassword(dto.password, customer.passwordHash)) {
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    return this.issueCustomerSession(customer.id, customer.restaurantId, customer.email, customer.fullName, customer.phone);
  }

  async getSessionUser(token: string, expectedRole: 'admin' | 'customer') {
    const payload = this.verifyAccessToken(token, expectedRole);

    if (payload.role === 'admin') {
      const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!admin) throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Admin no longer exists.' });
      return {
        role: 'admin',
        id: admin.id,
        username: admin.username,
        name: admin.displayName,
        restaurantId: admin.restaurantId,
      };
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
    if (!customer) throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Customer no longer exists.' });

    return {
      role: 'customer',
      id: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      restaurantId: customer.restaurantId,
    };
  }

  verifyAccessToken(token: string, expectedRole: 'admin' | 'customer'): AccessTokenPayload {
    if (!token) {
      throw new UnauthorizedException({ error: 'AUTH_REQUIRED', message: 'Missing bearer token.' });
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.tokenService.verify(token);
    } catch {
      throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Invalid access token.' });
    }

    if (payload.role !== expectedRole) {
      throw new UnauthorizedException({ error: 'AUTH_ROLE_MISMATCH', message: 'Invalid token scope.' });
    }

    return payload;
  }

  async updateCustomerProfile(token: string, dto: UpdateCustomerProfileDto) {
    const payload = this.verifyAccessToken(token, 'customer');

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: payload.sub,
        restaurantId: payload.restaurantId,
      },
    });

    if (!customer) {
      throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Customer no longer exists.' });
    }

    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        fullName: dto.fullName ?? customer.fullName,
        phone: dto.phone === undefined ? customer.phone : dto.phone || null,
      },
    });

    return {
      role: 'customer',
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      restaurantId: updated.restaurantId,
    };
  }

  private issueCustomerSession(id: string, restaurantId: string, email: string, fullName: string, phone: string | null) {
    const token = this.tokenService.sign({
      sub: id,
      role: 'customer',
      restaurantId,
      email,
    });

    return {
      token,
      customer: {
        id,
        fullName,
        email,
        phone,
        restaurantId,
      },
    };
  }
}
