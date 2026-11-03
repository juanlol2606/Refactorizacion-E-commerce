import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import {
  AuthResponseDto,
  CreateUserDto,
  LoginUserDto,
  LogoutResponseDto,
} from './dto';
import { User } from './entities/user.entity';
import { AuthSession } from './interfaces';
import { TokenService } from './services/token.service';

const SET_COOKIE_HEADERS = {
  'Set-Cookie': {
    description:
      'access_token (HttpOnly, SameSite=Lax, Path=/api) y csrf_token (legible por JavaScript, SameSite=Lax, Path=/)',
    schema: { type: 'string' },
  },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('register')
  @ApiResponse({
    status: 201,
    description: 'User was created and the session cookies were set',
    type: AuthResponseDto,
    headers: SET_COOKIE_HEADERS,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.startSession(res, await this.authService.create(createUserDto));
  }

  @Post('login')
  @ApiResponse({
    status: 201,
    description: 'User was logged in and the session cookies were set',
    type: AuthResponseDto,
    headers: SET_COOKIE_HEADERS,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async loginUser(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.startSession(res, await this.authService.login(loginUserDto));
  }

  @Get('check-status')
  @Auth()
  @ApiResponse({
    status: 200,
    description: 'The session is valid; the cookies were renewed',
    type: AuthResponseDto,
    headers: SET_COOKIE_HEADERS,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  checkAuthStatus(
    @GetUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): AuthResponseDto {
    return this.startSession(res, this.authService.checkAuthStatus(user));
  }

  @Post('logout')
  @HttpCode(200)
  @Auth()
  @ApiResponse({
    status: 200,
    description: 'The session cookies were expired',
    type: LogoutResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Missing or invalid CSRF token' })
  logout(@Res({ passthrough: true }) res: Response): LogoutResponseDto {
    this.tokenService.clearSessionCookies(res);

    return { ok: true };
  }

  /** Entrega el JWT y el token CSRF en cookies y responde solo con el usuario. */
  private startSession(
    res: Response,
    { user, accessToken }: AuthSession,
  ): AuthResponseDto {
    this.tokenService.setSessionCookies(res, accessToken, user.id);

    return { user };
  }
}
