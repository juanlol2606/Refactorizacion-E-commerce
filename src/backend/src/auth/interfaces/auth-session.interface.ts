import { UserResponseDto } from '../dto/user-response.dto';

/**
 * Resultado interno de register, login y check-status. El JWT no se expone en
 * el cuerpo HTTP: el controlador lo entrega en la cookie `access_token` y
 * responde solo con `user` (ADR-004).
 */
export interface AuthSession {
  user: UserResponseDto;
  accessToken: string;
}
