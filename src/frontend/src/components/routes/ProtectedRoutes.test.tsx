import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/auth/store/auth.store';
import type { User } from '@/interfaces/user.interface';
import {
  AdminRoute,
  AuthenticatedRoute,
  NotAuthenticatedRoute,
} from './ProtectedRoutes';

const user: User = {
  id: 'u-1',
  email: 'test1@google.com',
  fullName: 'Test One',
  isActive: true,
  roles: ['user'],
};
const admin: User = { ...user, id: 'u-2', roles: ['admin'] };

const setSession = (
  authStatus: 'authenticated' | 'not-authenticated' | 'checking',
  sessionUser: User | null = null,
) => useAuthStore.setState({ user: sessionUser, authStatus });

/** Monta la ruta protegida en /destino y deja páginas marcadoras en / y /auth/login. */
const renderAt = (guarded: ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/destino']}>
      <Routes>
        <Route path="/destino" element={guarded} />
        <Route path="/" element={<p>pagina-inicio</p>} />
        <Route path="/auth/login" element={<p>pagina-login</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoutes (según authStatus e isAdmin)', () => {
  beforeEach(() => setSession('checking'));

  describe('AuthenticatedRoute', () => {
    it('mientras se comprueba la sesión no muestra nada ni redirige', () => {
      const { container } = renderAt(
        <AuthenticatedRoute>
          <p>contenido-privado</p>
        </AuthenticatedRoute>,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('sin sesión redirige al login', () => {
      setSession('not-authenticated');

      renderAt(
        <AuthenticatedRoute>
          <p>contenido-privado</p>
        </AuthenticatedRoute>,
      );

      expect(screen.getByText('pagina-login')).toBeInTheDocument();
      expect(screen.queryByText('contenido-privado')).not.toBeInTheDocument();
    });

    it('con sesión muestra el contenido', () => {
      setSession('authenticated', user);

      renderAt(
        <AuthenticatedRoute>
          <p>contenido-privado</p>
        </AuthenticatedRoute>,
      );

      expect(screen.getByText('contenido-privado')).toBeInTheDocument();
    });
  });

  describe('NotAuthenticatedRoute', () => {
    it('mientras se comprueba la sesión no muestra nada', () => {
      const { container } = renderAt(
        <NotAuthenticatedRoute>
          <p>formulario-de-acceso</p>
        </NotAuthenticatedRoute>,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('sin sesión muestra el formulario de acceso', () => {
      setSession('not-authenticated');

      renderAt(
        <NotAuthenticatedRoute>
          <p>formulario-de-acceso</p>
        </NotAuthenticatedRoute>,
      );

      expect(screen.getByText('formulario-de-acceso')).toBeInTheDocument();
    });

    it('con sesión redirige al inicio', () => {
      setSession('authenticated', user);

      renderAt(
        <NotAuthenticatedRoute>
          <p>formulario-de-acceso</p>
        </NotAuthenticatedRoute>,
      );

      expect(screen.getByText('pagina-inicio')).toBeInTheDocument();
      expect(screen.queryByText('formulario-de-acceso')).not.toBeInTheDocument();
    });
  });

  describe('AdminRoute', () => {
    it('mientras se comprueba la sesión no muestra nada', () => {
      const { container } = renderAt(
        <AdminRoute>
          <p>panel-admin</p>
        </AdminRoute>,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('sin sesión redirige al login', () => {
      setSession('not-authenticated');

      renderAt(
        <AdminRoute>
          <p>panel-admin</p>
        </AdminRoute>,
      );

      expect(screen.getByText('pagina-login')).toBeInTheDocument();
    });

    it('con sesión de un usuario sin rol admin redirige al inicio', () => {
      setSession('authenticated', user);

      renderAt(
        <AdminRoute>
          <p>panel-admin</p>
        </AdminRoute>,
      );

      expect(screen.getByText('pagina-inicio')).toBeInTheDocument();
      expect(screen.queryByText('panel-admin')).not.toBeInTheDocument();
    });

    it('con sesión de un admin muestra el panel', () => {
      setSession('authenticated', admin);

      renderAt(
        <AdminRoute>
          <p>panel-admin</p>
        </AdminRoute>,
      );

      expect(screen.getByText('panel-admin')).toBeInTheDocument();
    });
  });
});
