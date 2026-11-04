import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import type { Response } from 'express';

import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE } from '../auth.constants';
import { TokenService } from './token.service';

const JWT_SECRET = 'secreto-jwt-de-pruebas';
const CSRF_SECRET = 'secreto-csrf-de-pruebas-1234';

const buildService = (env: Record<string, string> = {}) => {
  const jwtService = new JwtService({
    secret: JWT_SECRET,
    signOptions: { expiresIn: '2h' },
  });
  const configService = new ConfigService({
    CSRF_SECRET,
    ...env,
  });
  return {
    jwtService,
    service: new TokenService(jwtService, configService),
  };
};

const buildResponse = () => {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return {
    res: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
};

describe('TokenService', () => {
  describe('configuración', () => {
    // ConfigService también lee process.env cuando una clave no está en su
    // configuración interna: sin aislarlo, estas pruebas fallan si el entorno
    // (por ejemplo el CI o un shell con el .env cargado) define CSRF_SECRET.
    let csrfSecretDelEntorno: string | undefined;

    beforeEach(() => {
      csrfSecretDelEntorno = process.env.CSRF_SECRET;
      delete process.env.CSRF_SECRET;
    });

    afterEach(() => {
      if (csrfSecretDelEntorno === undefined) {
        delete process.env.CSRF_SECRET;
      } else {
        process.env.CSRF_SECRET = csrfSecretDelEntorno;
      }
    });

    it('falla al arrancar si falta CSRF_SECRET', () => {
      expect(
        () =>
          new TokenService(
            new JwtService({ secret: JWT_SECRET }),
            new ConfigService({}),
          ),
      ).toThrow(/CSRF_SECRET/);
    });

    it('falla si CSRF_SECRET es demasiado corto', () => {
      expect(
        () =>
          new TokenService(
            new JwtService({ secret: JWT_SECRET }),
            new ConfigService({ CSRF_SECRET: 'corto' }),
          ),
      ).toThrow(/CSRF_SECRET/);
    });
  });

  describe('JWT', () => {
    it('firma y verifica un token con el id del usuario', () => {
      const { service } = buildService();

      const token = service.signAccessToken('u-1');

      expect(service.verifyAccessToken(token).id).toBe('u-1');
    });

    it('rechaza un token firmado con otro secreto', () => {
      const { service } = buildService();
      const forged = new JwtService({ secret: 'otro-secreto' }).sign({
        id: 'u-1',
      });

      expect(() => service.verifyAccessToken(forged)).toThrow();
    });

    it('rechaza un token expirado', () => {
      const { service, jwtService } = buildService();
      const expired = jwtService.sign({ id: 'u-1' }, { expiresIn: '-10s' });

      expect(() => service.verifyAccessToken(expired)).toThrow(/expired/i);
    });
  });

  describe('lectura del token', () => {
    const { service } = buildService();

    it('lo toma de la cookie access_token de la petición', () => {
      const req = { cookies: { [ACCESS_TOKEN_COOKIE]: 'abc.def.ghi' } };

      expect(service.getAccessTokenFromRequest(req as never)).toBe(
        'abc.def.ghi',
      );
    });

    it('devuelve null sin cookies, sin cookie de sesión o con valor vacío', () => {
      expect(service.getAccessTokenFromRequest({} as never)).toBeNull();
      expect(
        service.getAccessTokenFromRequest({ cookies: { otra: 'x' } } as never),
      ).toBeNull();
      expect(
        service.getAccessTokenFromRequest({
          cookies: { [ACCESS_TOKEN_COOKIE]: '' },
        } as never),
      ).toBeNull();
    });

    it('lo extrae de una cabecera Cookie cruda (handshake de WebSocket)', () => {
      const header = `theme=dark; ${ACCESS_TOKEN_COOKIE}=abc.def.ghi; csrf_token=n.m`;

      expect(service.getAccessTokenFromCookieHeader(header)).toBe(
        'abc.def.ghi',
      );
    });

    it('decodifica el valor y tolera comillas', () => {
      expect(
        service.getAccessTokenFromCookieHeader(
          `${ACCESS_TOKEN_COOKIE}="a%2Bb"`,
        ),
      ).toBe('a+b');
    });

    it('devuelve null si la cabecera no existe, no trae la cookie o está mal codificada', () => {
      expect(service.getAccessTokenFromCookieHeader(undefined)).toBeNull();
      expect(service.getAccessTokenFromCookieHeader('a=1; b=2')).toBeNull();
      expect(
        service.getAccessTokenFromCookieHeader(`${ACCESS_TOKEN_COOKIE}=%E0%A4`),
      ).toBeNull();
    });
  });

  describe('token CSRF', () => {
    const { service } = buildService();

    it('tiene el formato nonce.hmac en hexadecimal y es distinto en cada emisión', () => {
      const first = service.createCsrfToken('u-1');
      const second = service.createCsrfToken('u-1');

      expect(first).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{64}$/);
      expect(first).not.toBe(second);
    });

    it('el HMAC se calcula con CSRF_SECRET sobre nonce + userId', () => {
      const [nonce, mac] = service.createCsrfToken('u-1').split('.');

      const expected = crypto
        .createHmac('sha256', CSRF_SECRET)
        .update(`${nonce}u-1`)
        .digest('hex');

      expect(mac).toBe(expected);
    });

    it('acepta el token del propio usuario', () => {
      expect(
        service.isValidCsrfToken(service.createCsrfToken('u-1'), 'u-1'),
      ).toBe(true);
    });

    it('rechaza el token de otro usuario', () => {
      expect(
        service.isValidCsrfToken(service.createCsrfToken('u-1'), 'u-2'),
      ).toBe(false);
    });

    it('rechaza un token firmado con otro secreto', () => {
      const other = buildService({
        CSRF_SECRET: 'otro-secreto-csrf-de-pruebas',
      }).service;

      expect(
        service.isValidCsrfToken(other.createCsrfToken('u-1'), 'u-1'),
      ).toBe(false);
    });

    it('rechaza un token con el nonce o el HMAC alterados', () => {
      const [nonce, mac] = service.createCsrfToken('u-1').split('.');
      const flip = (hex: string) => (hex[0] === 'a' ? 'b' : 'a') + hex.slice(1);

      expect(service.isValidCsrfToken(`${flip(nonce)}.${mac}`, 'u-1')).toBe(
        false,
      );
      expect(service.isValidCsrfToken(`${nonce}.${flip(mac)}`, 'u-1')).toBe(
        false,
      );
    });

    it.each([
      ['undefined', undefined],
      ['vacío', ''],
      ['sin punto', 'abcdef'],
      ['con tres partes', 'a.b.c'],
      ['sin hmac', 'abcd.'],
      ['no hexadecimal', 'zz.yy'],
      ['hmac más corto', 'abcd.abcd'],
    ])('rechaza un token mal formado (%s)', (_name, token) => {
      expect(service.isValidCsrfToken(token, 'u-1')).toBe(false);
    });

    it('compara en tiempo constante con timingSafeEqual', () => {
      const spy = jest.spyOn(crypto, 'timingSafeEqual');

      service.isValidCsrfToken(service.createCsrfToken('u-1'), 'u-1');
      service.safeEqual('mismo-valor', 'mismo-valor');

      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('safeEqual compara cadenas y rechaza vacíos o de distinta longitud', () => {
      expect(service.safeEqual('abc', 'abc')).toBe(true);
      expect(service.safeEqual('abc', 'abd')).toBe(false);
      expect(service.safeEqual('abc', 'abcd')).toBe(false);
      expect(service.safeEqual('', '')).toBe(false);
      expect(service.safeEqual(undefined, 'abc')).toBe(false);
    });
  });

  describe('cookies de sesión', () => {
    it('access_token: httpOnly, SameSite=Lax, Path=/api, sin Secure por defecto y vigencia del JWT', () => {
      const { service } = buildService();
      const response = buildResponse();
      const token = service.signAccessToken('u-1');

      service.setSessionCookies(response.res, token, 'u-1');

      expect(response.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api',
        maxAge: 2 * 60 * 60 * 1000,
      });
    });

    it('csrf_token: legible por JavaScript, SameSite=Lax, Path=/ y misma vigencia', () => {
      const { service } = buildService();
      const response = buildResponse();
      const token = service.signAccessToken('u-1');

      const { csrfToken } = service.setSessionCookies(
        response.res,
        token,
        'u-1',
      );

      expect(response.cookie).toHaveBeenCalledWith(
        CSRF_TOKEN_COOKIE,
        csrfToken,
        {
          httpOnly: false,
          sameSite: 'lax',
          secure: false,
          path: '/',
          maxAge: 2 * 60 * 60 * 1000,
        },
      );
      expect(service.isValidCsrfToken(csrfToken, 'u-1')).toBe(true);
    });

    it('marca ambas cookies como Secure solo con COOKIE_SECURE=true', () => {
      const { service } = buildService({ COOKIE_SECURE: 'true' });
      const response = buildResponse();

      service.setSessionCookies(
        response.res,
        service.signAccessToken('u-1'),
        'u-1',
      );

      for (const call of response.cookie.mock.calls as [
        string,
        string,
        object,
      ][]) {
        expect(call[2]).toMatchObject({ secure: true });
      }
    });

    it('la vigencia sigue a JWT_EXPIRES_IN del token firmado', () => {
      const { service, jwtService } = buildService();
      const response = buildResponse();
      const token = jwtService.sign({ id: 'u-1' }, { expiresIn: '30m' });

      service.setSessionCookies(response.res, token, 'u-1');

      expect(response.cookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        token,
        expect.objectContaining({ maxAge: 30 * 60 * 1000 }),
      );
    });

    it('clearSessionCookies expira ambas cookies con los mismos Path y atributos', () => {
      const { service } = buildService();
      const response = buildResponse();

      service.clearSessionCookies(response.res);

      expect(response.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api',
      });
      expect(response.clearCookie).toHaveBeenCalledWith(CSRF_TOKEN_COOKIE, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        path: '/',
      });
    });
  });
});
