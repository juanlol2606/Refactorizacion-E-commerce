import { ApiProperty } from '@nestjs/swagger';
import { Expose, plainToInstance } from 'class-transformer';

import { User } from '../entities/user.entity';

/**
 * Representación PÚBLICA de un usuario (ADR-002).
 *
 * Funciona como lista blanca: solo las propiedades marcadas con @Expose()
 * salen en las respuestas. Si en el futuro se agrega una columna sensible a
 * la entidad `User`, NO se expone por defecto; para exponerla hay que
 * declararla aquí de forma explícita.
 */
export class UserResponseDto {
  @ApiProperty({
    example: '60eb7791-1d26-4ad8-b5a0-ac741c92475a',
    description: 'User ID',
  })
  @Expose()
  id: string;

  @ApiProperty({ example: 'mail@gmail.com', description: 'User email' })
  @Expose()
  email: string;

  @ApiProperty({ example: 'Jhon Doe', description: 'User full name' })
  @Expose()
  fullName: string;

  @ApiProperty({ example: true, description: 'User status' })
  @Expose()
  isActive: boolean;

  @ApiProperty({ example: ['user'], description: 'User roles' })
  @Expose()
  roles: string[];

  /** Convierte una entidad `User` en su representación pública. */
  static fromEntity(user: Partial<User>): UserResponseDto {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}
