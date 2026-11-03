import { eShopApi } from '@/api/eShopApi';
import type { AuthResponse } from '../interfaces/auth.response';

/** Un 401 significa que no hay sesión: axios lanza y el store lo trata como no autenticado. */
export const checkAuthAction = async (): Promise<AuthResponse> => {
  const { data } = await eShopApi.get<AuthResponse>('/auth/check-status');

  return data;
};
