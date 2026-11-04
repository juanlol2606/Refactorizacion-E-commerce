import { eShopApi } from '@/api/eShopApi';
import type { LogoutResponse } from '../interfaces/auth.response';

export const logoutAction = async (): Promise<LogoutResponse> => {
  const { data } = await eShopApi.post<LogoutResponse>('/auth/logout');

  return data;
};
