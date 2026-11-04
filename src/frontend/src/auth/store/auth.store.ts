import { create } from 'zustand';
import { loginAction } from '../actions/login.action';
import type { User } from '@/interfaces/user.interface';
import { checkAuthAction } from '../actions/check-auth.action';
import { registerAction } from '../actions/register.action';
import { logoutAction } from '../actions/logout.action';

type AuthStatus = 'authenticated' | 'not-authenticated' | 'checking';

type AuthState = {
  user: User | null;
  authStatus: AuthStatus;
  isAdmin: () => boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
};

// ADR-004: el JWT vive en una cookie httpOnly que JavaScript no puede leer, así
// que el store guarda solo el usuario y el estado de la sesión, en memoria.
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  authStatus: 'checking',
  isAdmin: () => {
    const roles = get().user?.roles || [];
    return roles.includes('admin');
  },
  login: async (email: string, password: string) => {
    try {
      const { user } = await loginAction(email, password);

      set({ user, authStatus: 'authenticated' });
      return true;
    } catch {
      set({ user: null, authStatus: 'not-authenticated' });
      return false;
    }
  },
  register: async (fullName: string, email: string, password: string) => {
    try {
      const { user } = await registerAction(fullName, email, password);

      set({ user, authStatus: 'authenticated' });
      return true;
    } catch {
      set({ user: null, authStatus: 'not-authenticated' });
      return false;
    }
  },
  logout: async () => {
    try {
      await logoutAction();
    } catch {
      // Aunque el servidor no responda, la sesión local se cierra igual.
    } finally {
      set({ user: null, authStatus: 'not-authenticated' });
    }
  },
  checkAuthStatus: async () => {
    try {
      const { user } = await checkAuthAction();

      set({ user, authStatus: 'authenticated' });
      return true;
    } catch {
      set({ user: null, authStatus: 'not-authenticated' });
      return false;
    }
  },
}));
