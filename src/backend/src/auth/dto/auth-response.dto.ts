import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from './user-response.dto';

/**
 * Cuerpo de las respuestas de register, login y check-status (ADR-004).
 * El JWT NO viaja aquí: se entrega en la cookie httpOnly `access_token`.
 */
export class AuthResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;
}
