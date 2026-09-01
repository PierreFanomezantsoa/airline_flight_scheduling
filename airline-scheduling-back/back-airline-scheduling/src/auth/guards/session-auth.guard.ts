import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { SessionUser } from '../interfaces/session-user.interface';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      user?: SessionUser;
    }>();

    const authorization = request.headers?.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session requise.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const payload = this.verifyToken(token);
    request.user = payload;
    return true;
  }

  private verifyToken(token: string): SessionUser {
    const secret = this.config.get<string>('AUTH_SECRET');
    if (!secret) {
      throw new Error('AUTH_SECRET doit être configuré dans .env.');
    }

    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) {
      throw new UnauthorizedException('Session invalide.');
    }

    const expected = createHmac('sha256', secret)
      .update(encoded)
      .digest('base64url');

    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Session invalide.');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Session invalide.');
    }

    if (!raw || typeof raw !== 'object') {
      throw new UnauthorizedException('Session invalide.');
    }

    const payload = raw as Record<string, unknown>;
    const id = payload.sub;
    const role = payload.role;
    const exp = payload.exp;

    if (
      typeof id !== 'string' ||
      typeof role !== 'string' ||
      typeof exp !== 'number'
    ) {
      throw new UnauthorizedException('Session invalide.');
    }

    if (Date.now() >= exp) {
      throw new UnauthorizedException('Session expirée.');
    }

    return {
      id,
      role: role as SessionUser['role'],
      exp,
    };
  }
}
