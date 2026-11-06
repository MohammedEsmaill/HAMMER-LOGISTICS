import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SessionService } from '../session.service';
import { TokenService } from '../token.service';

/** Global guard: every route needs a valid access token for the user's current session. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('سجّل الدخول الأول');

    const payload = await this.tokens.verifyAccess(token);
    // Re-read the user each request: a deactivated account, a changed role or a login
    // from another device takes effect immediately.
    (request as Request & { user: unknown }).user = await this.sessions.resolve(
      payload.sub,
      payload.sid,
    );
    return true;
  }
}
