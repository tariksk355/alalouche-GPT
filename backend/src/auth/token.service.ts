import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  role: 'admin' | 'customer';
  restaurantId: string;
  email?: string;
  username?: string;
}

@Injectable()
export class TokenService {
  private readonly expiresInSeconds = 60 * 60 * 24 * 7;

  sign(payload: AccessTokenPayload): string {
    const body = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + this.expiresInSeconds,
    };
    const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = createHmac('sha256', this.secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  verify(token: string): AccessTokenPayload {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) {
      throw new Error('Invalid token format');
    }

    const expected = createHmac('sha256', this.secret).update(encoded).digest('base64url');
    if (expected !== signature) {
      throw new Error('Invalid token signature');
    }

    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AccessTokenPayload & { exp: number };
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    const { exp: _exp, ...payload } = parsed;
    return payload;
  }

  private get secret(): string {
    return process.env.AUTH_TOKEN_SECRET || 'dev-auth-token-secret';
  }
}