import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eShopApi, readCookie } from './eShopApi';

let sent: InternalAxiosRequestConfig | undefined;

const clearCookies = () => {
  document.cookie.split('; ').forEach((cookie) => {
    const name = cookie.split('=')[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  });
};

const request = async (config: AxiosRequestConfig) => {
  await eShopApi.request(config);
  return sent!;
};

describe('eShopApi (cookie de sesión y cabecera CSRF)', () => {
  beforeEach(() => {
    sent = undefined;
    clearCookies();
    localStorage.clear();
    // Adaptador simulado: no hay red; solo se captura la petición ya intervenida.
    eShopApi.defaults.adapter = (config) => {
      sent = config;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };
  });

  afterEach(() => {
    clearCookies();
  });

  it('envía las credenciales (withCredentials) para que viaje la cookie httpOnly', () => {
    expect(eShopApi.defaults.withCredentials).toBe(true);
  });

  describe('cabecera X-CSRF-Token', () => {
    beforeEach(() => {
      document.cookie = 'csrf_token=nonce123.mac456; Path=/';
    });

    it.each(['post', 'put', 'patch', 'delete', 'POST', 'Patch'])(
      '%s la lleva con el valor de la cookie csrf_token',
      async (method) => {
        const config = await request({ url: '/algo', method });

        expect(config.headers.get('X-CSRF-Token')).toBe('nonce123.mac456');
      },
    );

    it.each(['get', 'head', 'options'])('%s no la lleva', async (method) => {
      const config = await request({ url: '/algo', method });

      expect(config.headers.get('X-CSRF-Token')).toBeFalsy();
    });

    it('una petición sin método explícito se trata como GET', async () => {
      const config = await request({ url: '/algo' });

      expect(config.headers.get('X-CSRF-Token')).toBeFalsy();
    });

    it('no la lleva si todavía no existe la cookie csrf_token', async () => {
      clearCookies();

      const config = await request({ url: '/auth/login', method: 'post' });

      expect(config.headers.get('X-CSRF-Token')).toBeFalsy();
    });
  });

  describe('sin token en el navegador', () => {
    it('nunca envía Authorization ni lee localStorage', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      localStorage.setItem('token', 'jwt-antiguo');
      getItem.mockClear();
      document.cookie = 'csrf_token=n.m; Path=/';

      const config = await request({ url: '/algo', method: 'post' });

      expect(config.headers.get('Authorization')).toBeFalsy();
      expect(getItem).not.toHaveBeenCalled();
      getItem.mockRestore();
    });
  });

  describe('readCookie', () => {
    it('devuelve el valor decodificado de la cookie', () => {
      document.cookie = 'otra=1; Path=/';
      document.cookie = `csrf_token=${encodeURIComponent('a b+c')}; Path=/`;

      expect(readCookie('csrf_token')).toBe('a b+c');
    });

    it('devuelve undefined si la cookie no existe', () => {
      expect(readCookie('no_existe')).toBeUndefined();
    });

    it('no confunde cookies con el mismo prefijo', () => {
      document.cookie = 'csrf_token_viejo=zzz; Path=/';

      expect(readCookie('csrf_token')).toBeUndefined();
    });
  });
});
