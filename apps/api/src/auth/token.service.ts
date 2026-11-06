import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/env.validation';

export interface TokenPayload {
  sub: number; // user id
  sid: string; // session id; must match users.session_id
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  signAccess(payload: TokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
    });
  }

  signRefresh(payload: TokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.refreshTtlSeconds(),
    });
  }

  verifyAccess(token: string): Promise<TokenPayload> {
    return this.verify(
      token,
      this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    );
  }

  verifyRefresh(token: string): Promise<TokenPayload> {
    return this.verify(
      token,
      this.config.get('JWT_REFRESH_SECRET', { infer: true }),
    );
  }

  refreshTtlSeconds(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400;
  }

  private async verify(token: string, secret: string): Promise<TokenPayload> {
    try {
      const { sub, sid } = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret,
      });
      if (typeof sub !== 'number' || typeof sid !== 'string') throw new Error();
      return { sub, sid };
    } catch {
      throw new UnauthorizedException('انتهت الجلسة، سجّل الدخول تاني');
    }
  }
}
