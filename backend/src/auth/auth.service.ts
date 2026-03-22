import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerSignupDto } from './dto/customer-signup.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { hashPassword, verifyPassword } from './password';
import { AccessTokenPayload, TokenService } from './token.service';

@Injectable()
export class AuthService {
  private readonly verificationTokenExpiresInMs = 1000 * 60 * 60 * 24;
  private readonly passwordResetTokenExpiresInMs = 1000 * 60 * 60 * 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
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
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { primaryDomain: true },
    });
    const normalizedEmail = dto.email.toLowerCase();
    const existing = await this.prisma.customer.findUnique({
      where: { restaurantId_email: { restaurantId, email: normalizedEmail } },
    });
    if (existing) {
      throw new ConflictException({ error: 'EMAIL_ALREADY_USED', message: 'Email already registered.' });
    }

    const verificationToken = this.generateToken();
    const verificationExpiresAt = new Date(Date.now() + this.verificationTokenExpiresInMs);
    const customer = await this.prisma.customer.create({
      data: {
        restaurantId,
        fullName: dto.fullName,
        email: normalizedEmail,
        phone: dto.phone || null,
        subscribedEmail: dto.subscribedEmail === true,
        emailVerificationTokenHash: this.hashToken(verificationToken),
        emailVerificationSentAt: new Date(),
        emailVerificationExpiresAt: verificationExpiresAt,
        passwordHash: hashPassword(dto.password),
      },
    });

    await this.notificationService.sendCustomerVerificationEmail({
      restaurantId,
      customerEmail: customer.email,
      customerName: customer.fullName,
      verificationUrl: this.buildCustomerVerificationUrl(verificationToken, restaurant?.primaryDomain || null),
      expiresAt: verificationExpiresAt,
    });

    return this.issueCustomerSession(customer);
  }

  async customerLogin(restaurantId: string, dto: CustomerLoginDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { restaurantId_email: { restaurantId, email: dto.email.toLowerCase() } },
    });

    if (!customer || customer.deletedAt || !verifyPassword(dto.password, customer.passwordHash)) {
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    return this.issueCustomerSession(customer);
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

    const customer = await this.requireActiveCustomer(payload.sub, payload.restaurantId);
    return this.toCustomerProfile(customer);
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
    const customer = await this.requireActiveCustomer(payload.sub, payload.restaurantId);

    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        fullName: dto.fullName ?? customer.fullName,
        phone: dto.phone === undefined ? customer.phone : dto.phone || null,
      },
    });

    return this.toCustomerProfile(updated);
  }

  async verifyCustomerEmail(restaurantId: string, token: string) {
    const tokenHash = this.hashToken(token);
    const customer = await this.prisma.customer.findFirst({
      where: {
        restaurantId,
        deletedAt: null,
        emailVerificationTokenHash: tokenHash,
      },
    });

    if (!customer) {
      throw new UnauthorizedException({ error: 'INVALID_VERIFICATION_TOKEN', message: 'Lien de vérification invalide.' });
    }

    if (customer.emailVerifiedAt) {
      return {
        verified: true,
        alreadyVerified: true,
        customer: this.toCustomerProfile(customer),
      };
    }

    if (!customer.emailVerificationExpiresAt || customer.emailVerificationExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ error: 'VERIFICATION_TOKEN_EXPIRED', message: 'Lien de vérification expiré.' });
    }

    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationSentAt: null,
        emailVerificationExpiresAt: null,
      },
    });

    return {
      verified: true,
      alreadyVerified: false,
      customer: this.toCustomerProfile(updated),
    };
  }

  async requestCustomerPasswordReset(restaurantId: string, email: string) {
    const normalizedEmail = email.toLowerCase();
    const [restaurant, customer] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { primaryDomain: true },
      }),
      this.prisma.customer.findFirst({
        where: {
          restaurantId,
          email: normalizedEmail,
          deletedAt: null,
        },
      }),
    ]);

    if (!customer) {
      return {
        message: 'Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.',
      };
    }

    const resetToken = this.generateToken();
    const resetExpiresAt = new Date(Date.now() + this.passwordResetTokenExpiresInMs);

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordResetTokenHash: this.hashToken(resetToken),
        passwordResetSentAt: new Date(),
        passwordResetExpiresAt: resetExpiresAt,
      },
    });

    await this.notificationService.sendCustomerPasswordResetEmail({
      restaurantId,
      customerEmail: customer.email,
      customerName: customer.fullName,
      resetUrl: this.buildCustomerAccountUrl('resetPasswordToken', resetToken, restaurant?.primaryDomain || null),
      expiresAt: resetExpiresAt,
    });

    return {
      message: 'Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.',
    };
  }

  async resetCustomerPassword(restaurantId: string, token: string, password: string) {
    const tokenHash = this.hashToken(token);
    const customer = await this.prisma.customer.findFirst({
      where: {
        restaurantId,
        deletedAt: null,
        passwordResetTokenHash: tokenHash,
      },
    });

    if (!customer) {
      throw new UnauthorizedException({ error: 'INVALID_PASSWORD_RESET_TOKEN', message: 'Lien de réinitialisation invalide.' });
    }

    if (!customer.passwordResetExpiresAt || customer.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ error: 'PASSWORD_RESET_TOKEN_EXPIRED', message: 'Lien de réinitialisation expiré.' });
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordHash: hashPassword(password),
        passwordResetTokenHash: null,
        passwordResetSentAt: null,
        passwordResetExpiresAt: null,
      },
    });

    return {
      reset: true,
      message: 'Votre mot de passe a été réinitialisé.',
    };
  }

  async deleteCustomerAccount(token: string) {
    const payload = this.verifyAccessToken(token, 'customer');
    const customer = await this.requireActiveCustomer(payload.sub, payload.restaurantId);
    const anonymizedEmail = this.buildDeletedCustomerEmail(customer);

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        fullName: 'Compte supprimé',
        email: anonymizedEmail,
        phone: null,
        subscribedEmail: false,
        emailVerifiedAt: null,
        emailVerificationTokenHash: null,
        emailVerificationSentAt: null,
        emailVerificationExpiresAt: null,
        passwordResetTokenHash: null,
        passwordResetSentAt: null,
        passwordResetExpiresAt: null,
        deletedAt: new Date(),
        passwordHash: hashPassword(randomBytes(32).toString('hex')),
      },
    });

    return { deleted: true };
  }

  private issueCustomerSession(customer: {
    id: string;
    restaurantId: string;
    email: string;
    fullName: string;
    phone: string | null;
    emailVerifiedAt: Date | null;
    deletedAt?: Date | null;
  }) {
    const token = this.tokenService.sign({
      sub: customer.id,
      role: 'customer',
      restaurantId: customer.restaurantId,
      email: customer.email,
    });

    return {
      token,
      customer: this.toCustomerProfile(customer),
    };
  }

  private toCustomerProfile(customer: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    restaurantId: string;
    emailVerifiedAt: Date | null;
  }) {
    return {
      role: 'customer' as const,
      id: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      restaurantId: customer.restaurantId,
      emailVerified: Boolean(customer.emailVerifiedAt),
      emailVerifiedAt: customer.emailVerifiedAt,
    };
  }

  private async requireActiveCustomer(customerId: string, restaurantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        restaurantId,
      },
    });

    if (!customer || customer.deletedAt) {
      throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Customer no longer exists.' });
    }

    return customer;
  }

  private buildDeletedCustomerEmail(customer: { id: string; restaurantId: string }) {
    return `deleted+${customer.restaurantId}.${customer.id}.${Date.now()}@deleted.local`;
  }

  private generateToken() {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildCustomerVerificationUrl(token: string, primaryDomain: string | null) {
    return this.buildCustomerAccountUrl('verifyEmailToken', token, primaryDomain);
  }

  private buildCustomerAccountUrl(queryParamName: string, token: string, primaryDomain: string | null) {
    const configuredBaseUrl = (process.env.CUSTOMER_APP_BASE_URL || '').trim().replace(/\/$/, '');
    const primaryDomainBaseUrl = primaryDomain?.trim() ? `https://${primaryDomain.trim().replace(/\/$/, '')}` : '';
    const baseUrl = configuredBaseUrl || primaryDomainBaseUrl;

    if (!baseUrl) {
      return `/Account?${encodeURIComponent(queryParamName)}=${encodeURIComponent(token)}`;
    }

    return `${baseUrl}/Account?${encodeURIComponent(queryParamName)}=${encodeURIComponent(token)}`;
  }
}
