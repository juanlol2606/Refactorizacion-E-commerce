import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { CSRF_HEADER, CSRF_TOKEN_COOKIE } from '../auth.constants';
import { User } from '../entities/user.entity';
import { TokenService } from '../services/token.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF por double-submit firmado (ADR-004).
 *
 * En las peticiones que modifican estado (POST, PUT, PATCH y DELETE) exige la
 * cabecera X-CSRF-Token y comprueba, siempre en tiempo constante, que:
 *   1. coincide con la cookie csrf_token enviada por el navegador, y
 *   2. fue firmada con CSRF_SECRET para el usuario autenticado.
 *
 * Debe ejecutarse DESPUÉS de AuthGuard, porque necesita `req.user`.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: Pick<User, 'id'> }>();

    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    const raw = req.headers[CSRF_HEADER];
    const header = Array.isArray(raw) ? raw[0] : raw;
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const cookie = cookies?.[CSRF_TOKEN_COOKIE];

    const valid =
      !!req.user &&
      typeof cookie === 'string' &&
      this.tokenService.safeEqual(header, cookie) &&
      this.tokenService.isValidCsrfToken(header, req.user.id);

    if (!valid) throw new ForbiddenException('Invalid or missing CSRF token');

    return true;
  }
}
