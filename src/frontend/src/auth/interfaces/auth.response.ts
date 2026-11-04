import type { User } from '@/interfaces/user.interface';

/** El JWT viaja en la cookie httpOnly access_token; el cuerpo trae solo el usuario. */
export interface AuthResponse {
  user: User;
}

export interface LogoutResponse {
  ok: boolean;
}
