import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';

import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_PATH,
  CSRF_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE_PATH,
} from '../auth.constants';
import { JwtPayload } from '../interfaces';

const MIN_CSRF_SECRET_LENGTH = 16;
const HEX = /^[0-9a-f]+$/i;

/**
 * Centraliza todo lo relativo al token de sesión (ADR-004): firma y verificación
 * del JWT, lectura desde la cookie, emisión y borrado de las cookies de sesión
 * y generación y validación del token CSRF.
 */
@Injectable()
export class TokenService {
  private readonly csrfSecret: string;
  private readonly secureCookies: boolean;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    const secret = configService.get<string>('CSRF_SECRET');
    if (!secret || secret.length < MIN_CSRF_SECRET_LENGTH) {
      throw new Error(
        `CSRF_SECRET es obligatorio y debe tener al menos ${MIN_CSRF_SECRET_LENGTH} caracteres`,
      );
    }
    this.csrfSecret = secret;
    this.secureCookies = configService.get<string>('COOKIE_SECURE') === 'true';
  }

  // ── JWT ────────────────────────────────────────────────────────────────

  signAccessToken(userId: string): string {
    const payload: JwtPayload = { id: userId };
    return this.jwtService.sign(payload);
  }

  /** Lanza si la firma no es válida o el token expiró. */
  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  getAccessTokenFromRequest(req: Pick<Request, 'cookies'>): string | null {
    const token = (req?.cookies as Record<string, unknown> | undefined)?.[
      ACCESS_TOKEN_COOKIE
    ];
    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  /** Lee el JWT de una cabecera `Cookie` cruda (handshake de WebSocket). */
  getAccessTokenFromCookieHeader(header?: string): string | null {
    if (!header) return null;

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      if (part.slice(0, separator).trim() !== ACCESS_TOKEN_COOKIE) continue;

      const raw = part
        .slice(separator + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1');
      try {
        return decodeURIComponent(raw) || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  // ── CSRF (double-submit firmado) ───────────────────────────────────────

  /** Formato: `nonce.HMAC_SHA256(CSRF_SECRET, nonce + userId)` (hexadecimal). */
  createCsrfToken(userId: string): string {
    const nonce = randomBytes(16).toString('hex');
    return `${nonce}.${this.sign(nonce, userId)}`;
  }

  isValidCsrfToken(token: string | undefined, userId: string): boolean {
    if (!token) return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [nonce, mac] = parts;
    if (!nonce || !mac || !HEX.test(nonce) || !HEX.test(mac)) return false;

    const received = Buffer.from(mac, 'hex');
    const expected = Buffer.from(this.sign(nonce, userId), 'hex');

    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  }

  /** Comparación en tiempo constante de dos cadenas (header vs. cookie). */
  safeEqual(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) return false;

    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
  }

  // ── Cookies de sesión ──────────────────────────────────────────────────

  /**
   * Fija `access_token` (httpOnly, Path=/api) y `csrf_token` (legible por JS,
   * Path=/) con la misma vigencia del JWT: `exp - iat` del propio token.
   */
  setSessionCookies(
    res: Response,
    accessToken: string,
    userId: string,
  ): { csrfToken: string } {
    const maxAge = this.maxAgeFor(accessToken);
    const csrfToken = this.createCsrfToken(userId);

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.accessCookieOptions(),
      maxAge,
    });
    res.cookie(CSRF_TOKEN_COOKIE, csrfToken, {
      ...this.csrfCookieOptions(),
      maxAge,
    });

    return { csrfToken };
  }

  clearSessionCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.accessCookieOptions());
    res.clearCookie(CSRF_TOKEN_COOKIE, this.csrfCookieOptions());
  }

  // ── Internos ───────────────────────────────────────────────────────────

  private sign(nonce: string, userId: string): string {
    return createHmac('sha256', this.csrfSecret)
      .update(nonce + userId)
      .digest('hex');
  }

  private maxAgeFor(accessToken: string): number | undefined {
    const decoded = this.jwtService.decode<{ exp?: number; iat?: number }>(
      accessToken,
    );
    return decoded?.exp && decoded?.iat
      ? (decoded.exp - decoded.iat) * 1000
      : undefined;
  }

  private accessCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secureCookies,
      path: ACCESS_TOKEN_COOKIE_PATH,
    };
  }

  private csrfCookieOptions(): CookieOptions {
    return {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.secureCookies,
      path: CSRF_TOKEN_COOKIE_PATH,
    };
  }
}
