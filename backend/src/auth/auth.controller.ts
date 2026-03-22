import { Body, Controller, Delete, Get, Headers, Patch, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerSignupDto } from './dto/customer-signup.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/auth/login')
  async adminLogin(@Body() dto: AdminLoginDto) {
    const session = await this.authService.adminLogin(dto);
    return ok(session);
  }

  @Get('admin/auth/me')
  async adminMe(@Headers('authorization') authorization?: string) {
    const token = this.extractBearer(authorization);
    const admin = await this.authService.getSessionUser(token, 'admin');
    return ok({ admin });
  }

  @Post('auth/signup')
  @UseGuards(TenantContextGuard)
  async customerSignup(@TenantCtx() tenant: TenantContext, @Body() dto: CustomerSignupDto) {
    const session = await this.authService.customerSignup(tenant.restaurantId, dto);
    return ok(session);
  }

  @Post('auth/login')
  @UseGuards(TenantContextGuard)
  async customerLogin(@TenantCtx() tenant: TenantContext, @Body() dto: CustomerLoginDto) {
    const session = await this.authService.customerLogin(tenant.restaurantId, dto);
    return ok(session);
  }

  @Post('auth/forgot-password')
  @UseGuards(TenantContextGuard)
  async requestCustomerPasswordReset(@TenantCtx() tenant: TenantContext, @Body() dto: RequestPasswordResetDto) {
    const result = await this.authService.requestCustomerPasswordReset(tenant.restaurantId, dto.email);
    return ok(result);
  }

  @Post('auth/reset-password')
  @UseGuards(TenantContextGuard)
  async resetCustomerPassword(@TenantCtx() tenant: TenantContext, @Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetCustomerPassword(tenant.restaurantId, dto.token, dto.password);
    return ok(result);
  }

  @Get('auth/verify-email')
  @UseGuards(TenantContextGuard)
  async verifyCustomerEmail(@TenantCtx() tenant: TenantContext, @Query('token') token?: string) {
    if (!token?.trim()) {
      throw new UnauthorizedException({ error: 'INVALID_VERIFICATION_TOKEN', message: 'Lien de vérification invalide.' });
    }

    const result = await this.authService.verifyCustomerEmail(tenant.restaurantId, token.trim());
    return ok(result);
  }

  @Get('auth/me')
  async customerMe(@Headers('authorization') authorization?: string) {
    const token = this.extractBearer(authorization);
    const customer = await this.authService.getSessionUser(token, 'customer');
    return ok({ customer });
  }

  @Patch('auth/me')
  async updateCustomerMe(@Body() dto: UpdateCustomerProfileDto, @Headers('authorization') authorization?: string) {
    const token = this.extractBearer(authorization);
    const customer = await this.authService.updateCustomerProfile(token, dto);
    return ok({ customer });
  }

  @Delete('auth/me')
  async deleteCustomerMe(@Headers('authorization') authorization?: string) {
    const token = this.extractBearer(authorization);
    const result = await this.authService.deleteCustomerAccount(token);
    return ok(result);
  }

  private extractBearer(authorization?: string): string {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ error: 'AUTH_REQUIRED', message: 'Bearer token required.' });
    }
    return authorization.slice('Bearer '.length);
  }
}
