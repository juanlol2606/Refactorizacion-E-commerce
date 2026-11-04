import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { CSRF_HEADER, CSRF_TOKEN_COOKIE } from '../auth.constants';
import { TokenService } from '../services/token.service';
import { CsrfGuard } from './csrf.guard';

interface FakeRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  user?: { id: string };
}

describe('CsrfGuard', () => {
  const tokenService = new TokenService(
    new JwtService({ secret: 'secreto-jwt-de-pruebas' }),
    new ConfigService({ CSRF_SECRET: 'secreto-csrf-de-pruebas-1234' }),
  );
  const guard = new CsrfGuard(tokenService);

  const contextFor = (req: FakeRequest) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  const mutating = (
    token: string | undefined,
    overrides: Partial<FakeRequest> = {},
  ): FakeRequest => ({
    method: 'POST',
    headers: { [CSRF_HEADER]: token },
    cookies: token ? { [CSRF_TOKEN_COOKIE]: token } : {},
    user: { id: 'u-1' },
    ...overrides,
  });

  describe('métodos seguros', () => {
    it.each(['GET', 'HEAD', 'OPTIONS', 'get'])(
      '%s pasa sin token CSRF',
      (method) => {
        const req: FakeRequest = { method, headers: {}, user: { id: 'u-1' } };

        expect(guard.canActivate(contextFor(req))).toBe(true);
      },
    );
  });

  describe('métodos que modifican estado', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      '%s con un token válido pasa',
      (method) => {
        const token = tokenService.createCsrfToken('u-1');

        expect(guard.canActivate(contextFor(mutating(token, { method })))).toBe(
          true,
        );
      },
    );

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      '%s sin cabecera X-CSRF-Token responde 403',
      (method) => {
        const token = tokenService.createCsrfToken('u-1');
        const req = mutating(token, { method });
        req.headers = {};

        expect(() => guard.canActivate(contextFor(req))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('responde 403 si no llega la cookie csrf_token', () => {
      const token = tokenService.createCsrfToken('u-1');
      const req = mutating(token);
      req.cookies = {};

      expect(() => guard.canActivate(contextFor(req))).toThrow(
        ForbiddenException,
      );
    });

    it('responde 403 si la cabecera no coincide con la cookie', () => {
      const req = mutating(tokenService.createCsrfToken('u-1'));
      req.cookies = {
        [CSRF_TOKEN_COOKIE]: tokenService.createCsrfToken('u-1'),
      };

      expect(() => guard.canActivate(contextFor(req))).toThrow(
        ForbiddenException,
      );
    });

    it('responde 403 si el token fue emitido para otro usuario', () => {
      const foreign = tokenService.createCsrfToken('u-2');

      expect(() => guard.canActivate(contextFor(mutating(foreign)))).toThrow(
        ForbiddenException,
      );
    });

    it('responde 403 con un token alterado aunque header y cookie coincidan', () => {
      const [nonce, mac] = tokenService.createCsrfToken('u-1').split('.');
      const tampered = `${nonce}.${(mac[0] === 'a' ? 'b' : 'a') + mac.slice(1)}`;

      expect(() => guard.canActivate(contextFor(mutating(tampered)))).toThrow(
        ForbiddenException,
      );
    });

    it('responde 403 con un valor arbitrario puesto por un atacante', () => {
      expect(() =>
        guard.canActivate(contextFor(mutating('valor-inventado'))),
      ).toThrow(ForbiddenException);
    });

    it('responde 403 si la petición no tiene usuario autenticado', () => {
      const token = tokenService.createCsrfToken('u-1');
      const req = mutating(token);
      delete req.user;

      expect(() => guard.canActivate(contextFor(req))).toThrow(
        ForbiddenException,
      );
    });

    it('toma el primer valor si la cabecera llega repetida', () => {
      const token = tokenService.createCsrfToken('u-1');
      const req = mutating(token);
      req.headers = { [CSRF_HEADER]: [token, 'otro'] };

      expect(guard.canActivate(contextFor(req))).toBe(true);
    });
  });
});
