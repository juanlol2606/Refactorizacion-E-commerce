import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth.store';
import { checkAuthAction } from '../actions/check-auth.action';
import { loginAction } from '../actions/login.action';
import { logoutAction } from '../actions/logout.action';
import { registerAction } from '../actions/register.action';
import type { User } from '@/interfaces/user.interface';

vi.mock('../actions/login.action');
vi.mock('../actions/register.action');
vi.mock('../actions/check-auth.action');
vi.mock('../actions/logout.action');

const user: User = {
  id: 'u-1',
  email: 'test1@google.com',
  fullName: 'Test One',
  isActive: true,
  roles: ['user'],
};
const admin: User = { ...user, id: 'u-2', roles: ['admin'] };

const initialState = () => useAuthStore.getState();

describe('auth.store (la API está simulada)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: null, authStatus: 'checking' });
  });

  it('arranca sin usuario y en estado "checking"', () => {
    expect(initialState().user).toBeNull();
    expect(initialState().authStatus).toBe('checking');
  });

  it('no tiene un campo token: el JWT vive en una cookie httpOnly', () => {
    expect(Object.keys(initialState())).not.toContain('token');
  });

  describe('login', () => {
    it('correcto: guarda el usuario, queda autenticado y devuelve true', async () => {
      vi.mocked(loginAction).mockResolvedValue({ user });

      const ok = await initialState().login(user.email, 'Abc123');

      expect(ok).toBe(true);
      expect(loginAction).toHaveBeenCalledWith(user.email, 'Abc123');
      expect(initialState().user).toEqual(user);
      expect(initialState().authStatus).toBe('authenticated');
    });

    it('correcto: no escribe nada en localStorage', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      vi.mocked(loginAction).mockResolvedValue({ user });

      await initialState().login(user.email, 'Abc123');

      expect(setItem).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      setItem.mockRestore();
    });

    it('fallido: deja la sesión como no autenticada y devuelve false', async () => {
      vi.mocked(loginAction).mockRejectedValue(new Error('401'));

      const ok = await initialState().login(user.email, 'incorrecta');

      expect(ok).toBe(false);
      expect(initialState().user).toBeNull();
      expect(initialState().authStatus).toBe('not-authenticated');
    });
  });

  describe('register', () => {
    it('correcto: queda autenticado con el usuario nuevo', async () => {
      vi.mocked(registerAction).mockResolvedValue({ user });

      const ok = await initialState().register(
        user.fullName,
        user.email,
        'Abc123',
      );

      expect(ok).toBe(true);
      expect(registerAction).toHaveBeenCalledWith(
        user.fullName,
        user.email,
        'Abc123',
      );
      expect(initialState().authStatus).toBe('authenticated');
    });

    it('fallido (por ejemplo, correo duplicado): no autenticado', async () => {
      vi.mocked(registerAction).mockRejectedValue(new Error('400'));

      const ok = await initialState().register(user.fullName, user.email, 'x');

      expect(ok).toBe(false);
      expect(initialState().authStatus).toBe('not-authenticated');
    });
  });

  describe('checkAuthStatus', () => {
    it('con sesión válida: autenticado y devuelve true', async () => {
      vi.mocked(checkAuthAction).mockResolvedValue({ user });

      const ok = await initialState().checkAuthStatus();

      expect(ok).toBe(true);
      expect(initialState().user).toEqual(user);
      expect(initialState().authStatus).toBe('authenticated');
    });

    it('un 401 (sin cookie o expirada) significa no autenticado', async () => {
      useAuthStore.setState({ user, authStatus: 'authenticated' });
      vi.mocked(checkAuthAction).mockRejectedValue(new Error('401'));

      const ok = await initialState().checkAuthStatus();

      expect(ok).toBe(false);
      expect(initialState().user).toBeNull();
      expect(initialState().authStatus).toBe('not-authenticated');
    });

    it('no consulta localStorage: la decisión la toma el servidor', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      vi.mocked(checkAuthAction).mockResolvedValue({ user });

      await initialState().checkAuthStatus();

      expect(getItem).not.toHaveBeenCalled();
      getItem.mockRestore();
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      useAuthStore.setState({ user, authStatus: 'authenticated' });
    });

    it('llama a POST /auth/logout y limpia el estado', async () => {
      vi.mocked(logoutAction).mockResolvedValue({ ok: true });

      await initialState().logout();

      expect(logoutAction).toHaveBeenCalledTimes(1);
      expect(initialState().user).toBeNull();
      expect(initialState().authStatus).toBe('not-authenticated');
    });

    it('limpia el estado local aunque la llamada falle y no lanza', async () => {
      vi.mocked(logoutAction).mockRejectedValue(new Error('red caída'));

      await expect(initialState().logout()).resolves.toBeUndefined();

      expect(initialState().user).toBeNull();
      expect(initialState().authStatus).toBe('not-authenticated');
    });
  });

  describe('isAdmin', () => {
    it('es true solo si el usuario tiene el rol admin', () => {
      useAuthStore.setState({ user: admin, authStatus: 'authenticated' });
      expect(initialState().isAdmin()).toBe(true);

      useAuthStore.setState({ user, authStatus: 'authenticated' });
      expect(initialState().isAdmin()).toBe(false);

      useAuthStore.setState({ user: null, authStatus: 'not-authenticated' });
      expect(initialState().isAdmin()).toBe(false);
    });
  });
});
