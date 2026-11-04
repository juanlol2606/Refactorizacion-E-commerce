import { ApiProperty } from '@nestjs/swagger';

export class LogoutResponseDto {
  @ApiProperty({ example: true, description: 'La sesión fue cerrada' })
  ok: boolean;
}
