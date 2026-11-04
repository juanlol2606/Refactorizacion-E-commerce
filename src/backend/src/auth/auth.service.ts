import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import * as bcrypt from 'bcrypt';

import { CreateUserDto, LoginUserDto, UserResponseDto } from './dto';
import { User } from './entities/user.entity';
import { AuthSession } from './interfaces';
import { TokenService } from './services/token.service';

// Mismo mensaje para correo inexistente y contraseña incorrecta: no permite
// descubrir qué correos están registrados.
const INVALID_CREDENTIALS = 'Credentials are not valid';
// Hash ficticio: con correo inexistente también se ejecuta bcrypt, de modo que
// el tiempo de respuesta tampoco delata si el correo existe.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('contrasena-ficticia', 10);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly tokenService: TokenService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<AuthSession> {
    try {
      const { password, ...userData } = createUserDto;

      const user = this.userRepository.create({
        ...userData,
        password: bcrypt.hashSync(password, 10),
      });

      await this.userRepository.save(user);

      return this.buildSession(user);
    } catch (error) {
      this.handleDBErrors(error);
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthSession> {
    const { password, email } = loginUserDto;

    const user = await this.userRepository.findOne({
      where: { email },
      select: {
        email: true,
        password: true,
        id: true,
        fullName: true,
        isActive: true,
        roles: true,
      },
    });

    if (!user) {
      bcrypt.compareSync(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!bcrypt.compareSync(password, user.password!))
      throw new UnauthorizedException(INVALID_CREDENTIALS);

    return this.buildSession(user);
  }

  checkAuthStatus(user: User): AuthSession {
    return this.buildSession(user);
  }

  /**
   * Único punto donde se arma la sesión (ADR-001 y ADR-004). La exclusión de
   * campos sensibles (p. ej. `password`) es declarativa: la define
   * UserResponseDto mediante @Expose(). El JWT no va en la respuesta: el
   * controlador lo entrega en una cookie httpOnly.
   */
  private buildSession(user: User): AuthSession {
    return {
      user: UserResponseDto.fromEntity(user),
      accessToken: this.tokenService.signAccessToken(user.id),
    };
  }

  private handleDBErrors(error: any): never {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.code === '23505') throw new BadRequestException(error.detail);

    console.log(error);

    throw new InternalServerErrorException('Check server logs');
  }
}
