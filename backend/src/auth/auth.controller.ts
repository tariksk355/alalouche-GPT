import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ok } from '../common/api-response';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerSignupDto } from './dto/customer-signup.dto';

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
  async customerSignup(@Body() dto: CustomerSignupDto) {
    const session = await this.authService.customerSignup(dto);
    return ok(session);
  }

  @Post('auth/login')
  async customerLogin(@Body() dto: CustomerLoginDto) {
    const session = await this.authService.customerLogin(dto);
    return ok(session);
  }

  @Get('auth/me')
  async customerMe(@Headers('authorization') authorization?: string) {
    const token = this.extractBearer(authorization);
    const customer = await this.authService.getSessionUser(token, 'customer');
    return ok({ customer });
  }

  private extractBearer(authorization?: string): string {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ error: 'AUTH_REQUIRED', message: 'Bearer token required.' });
    }
    return authorization.slice('Bearer '.length);
  }
}