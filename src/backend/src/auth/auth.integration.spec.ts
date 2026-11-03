/**
 * Pruebas de integración HTTP del módulo Auth (ADR-004).
 *
 * Levanta una aplicación Nest real con AuthController, AuthService, JwtStrategy
 * (Passport), JwtModule, TokenService y los guards (AuthGuard + UserRoleGuard +
 * CsrfGuard) usando supertest, con la misma configuración HTTP global que
 * main.ts (prefijo /api, cookie-parser, CORS y validación). Solo el repositorio
 * de TypeORM está simulado, por lo que NO se requiere PostgreSQL y las pruebas
 * corren con `pnpm test`.
 */
import {
  Controller,
  Delete,
  Get,
  INestApplication,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { setupApp } from '../app.setup';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_HEADER,
  CSRF_TOKEN_COOKIE,
} from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import { User } from './entities/user.entity';
import { ValidRoles } from './interfaces';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

interface AuthBody {
  user: {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
    roles: string[];
  };
}

const JWT_SECRET = 'secreto-de-pruebas-de-integracion';
const CSRF_SECRET = 'secreto-csrf-de-pruebas-de-integracion';
const FRONTEND_URL = 'http://localhost:5173';
const PLAIN_PASSWORD = 'Abc123';
const TWO_HOURS = 2 * 60 * 60;

/** Controlador de sondeo SOLO para pruebas: reemplaza a las antiguas rutas private*. */
@Controller('probe')
class ProbeController {
  @Get('any')
  @Auth()
  any(@GetUser() user: User) {
    return { ok: true, id: user.id };
  }

  @Get('admin')
  @Auth(ValidRoles.admin)
  admin(@GetUser() user: User) {
    return { ok: true, id: user.id };
  }

  @Get('staff')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  staff(@GetUser() user: User) {
    return { ok: true, id: user.id };
  }

  @Post('mutate')
  @Auth()
  post() {
    return { ok: true, verb: 'POST' };
  }

  @Put('mutate')
  @Auth()
  put() {
    return { ok: true, verb: 'PUT' };
  }

  @Patch('mutate')
  @Auth()
  patch() {
    return { ok: true, verb: 'PATCH' };
  }

  @Delete('mutate')
  @Auth()
  remove() {
    return { ok: true, verb: 'DELETE' };
  }

  @Post('mutate-admin')
  @Auth(ValidRoles.admin)
  postAdmin() {
    return { ok: true };
  }
}

describe('Auth (integración HTTP: cookie + CSRF + Guards + Passport + JWT)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let tokenService: TokenService;
  let hash: string;
  let users: Map<string, User>;

  const userRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
  };

  const makeUser = (id: string, overrides: Partial<User> = {}): User =>
    ({
      id,
      email: `${id}@google.com`,
      fullName: `Usuario ${id}`,
      password: hash,
      isActive: true,
      roles: ['user'],
      ...overrides,
    }) as User;

  const authBody = (res: request.Response) => res.body as AuthBody;
  const tokenFor = (id: string) => jwtService.sign({ id });

  /** Cabecera Cookie que enviaría el navegador tras iniciar sesión. */
  const sessionCookies = (
    id: string,
    csrf = tokenService.createCsrfToken(id),
  ) => ({
    csrf,
    cookies: [
      `${ACCESS_TOKEN_COOKIE}=${tokenFor(id)}`,
      `${CSRF_TOKEN_COOKIE}=${csrf}`,
    ],
  });

  const setCookies = (res: request.Response): string[] =>
    (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const setCookie = (res: request.Response, name: string) =>
    setCookies(res).find((c) => c.startsWith(`${name}=`));
  const cookieValue = (res: request.Response, name: string) =>
    setCookie(res, name)
      ?.split(';')[0]
      .slice(name.length + 1);

  beforeAll(async () => {
    hash = bcrypt.hashSync(PLAIN_PASSWORD, 4);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, CSRF_SECRET, FRONTEND_URL })],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>('JWT_SECRET'),
            signOptions: { expiresIn: '2h' },
          }),
        }),
      ],
      controllers: [AuthController, ProbeController],
      providers: [
        AuthService,
        JwtStrategy,
        TokenService,
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();

    jwtService = moduleRef.get(JwtService);
    tokenService = moduleRef.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();

    users = new Map<string, User>([
      ['usuario', makeUser('usuario')],
      ['admin', makeUser('admin', { roles: ['admin'] })],
      ['staff', makeUser('staff', { roles: ['super-user'] })],
      ['inactivo', makeUser('inactivo', { isActive: false })],
    ]);

    userRepository.findOneBy.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(users.get(id) ?? null),
    );
    userRepository.findOne.mockImplementation(
      ({ where }: { where: { email: string } }) =>
        Promise.resolve(
          [...users.values()].find((u) => u.email === where.email) ?? null,
        ),
    );
    userRepository.create.mockImplementation((data: Partial<User>) => ({
      ...data,
    }));
    // Como TypeORM, `save` muta la entidad recibida con los valores que genera
    // PostgreSQL (id, isActive y roles por defecto).
    userRepository.save.mockImplementation((u: Partial<User>) => {
      Object.assign(u, { id: 'nuevo', isActive: true, roles: ['user'] });
      return Promise.resolve(u);
    });
  });

  /** Verifica el contrato de cookies de sesión de una respuesta (ADR-004). */
  const expectSessionCookies = (res: request.Response, userId: string) => {
    const access = setCookie(res, ACCESS_TOKEN_COOKIE);
    const csrf = setCookie(res, CSRF_TOKEN_COOKIE);

    expect(access).toBeDefined();
    expect(access).toMatch(/;\s*HttpOnly/i);
    expect(access).toMatch(/;\s*SameSite=Lax/i);
    expect(access).toMatch(/;\s*Path=\/api(;|$)/);
    expect(access).toContain(`Max-Age=${TWO_HOURS}`);
    expect(access).not.toMatch(/;\s*Secure/i);

    expect(csrf).toBeDefined();
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(csrf).toMatch(/;\s*SameSite=Lax/i);
    expect(csrf).toMatch(/;\s*Path=\/(;|$)/);
    expect(csrf).toContain(`Max-Age=${TWO_HOURS}`);
    expect(csrf).not.toMatch(/;\s*Secure/i);

    expect(
      jwtService.verify<{ id: string }>(cookieValue(res, 'access_token')!).id,
    ).toBe(userId);
    expect(
      tokenService.isValidCsrfToken(cookieValue(res, 'csrf_token'), userId),
    ).toBe(true);
  };

  /** El cuerpo trae solo { user }: ni token ni el valor del JWT en ninguna parte. */
  const expectBodyWithoutToken = (res: request.Response) => {
    expect(Object.keys(res.body as object)).toEqual(['user']);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    expect(JSON.stringify(res.body)).not.toContain(
      cookieValue(res, 'access_token') ?? 'sin-cookie',
    );
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  };

  describe('POST /api/auth/register', () => {
    const body = {
      email: 'nuevo@google.com',
      fullName: 'Usuario Nuevo',
      password: PLAIN_PASSWORD,
    };

    it('201: registra al usuario, fija las cookies de sesión y responde solo { user }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(body)
        .expect(201);

      expect(authBody(res).user).toEqual({
        id: 'nuevo',
        email: body.email,
        fullName: body.fullName,
        isActive: true,
        roles: ['user'],
      });
      expectSessionCookies(res, 'nuevo');
      expectBodyWithoutToken(res);
    });

    it('no exige token CSRF (todavía no hay sesión)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(body)
        .expect(201);
    });

    it('400: rechaza una contraseña débil y no fija cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...body, password: 'abcdef' })
        .expect(400);
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(setCookies(res)).toHaveLength(0);
    });

    it('400: rechaza un correo inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...body, email: 'no-es-correo' })
        .expect(400);
    });

    it('400: rechaza propiedades no permitidas (no se puede auto-asignar el rol admin)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...body, roles: ['admin'] })
        .expect(400);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('400: correo ya registrado', async () => {
      userRepository.save.mockRejectedValue({
        code: '23505',
        detail: 'Key (email)=(nuevo@google.com) already exists.',
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(body)
        .expect(400);
      expect(setCookies(res)).toHaveLength(0);
    });
  });

  describe('POST /api/auth/login', () => {
    it('201: credenciales válidas fijan las cookies y responden solo { user }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'usuario@google.com', password: PLAIN_PASSWORD })
        .expect(201);

      expect(authBody(res).user.email).toBe('usuario@google.com');
      expectSessionCookies(res, 'usuario');
      expectBodyWithoutToken(res);
      expect(JSON.stringify(res.body)).not.toContain(hash);
    });

    it('401: contraseña incorrecta, sin cookies ni token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'usuario@google.com', password: 'Incorrecta1' })
        .expect(401);
      expect(setCookies(res)).toHaveLength(0);
      expect(res.body).not.toHaveProperty('user');
    });

    it('401: correo inexistente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nadie@google.com', password: PLAIN_PASSWORD })
        .expect(401);
      expect(setCookies(res)).toHaveLength(0);
    });

    it('400: cuerpo mal formado (correo inválido)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'x', password: PLAIN_PASSWORD })
        .expect(400);
    });
  });

  describe('GET /api/auth/check-status (ruta protegida + renovación)', () => {
    const get = (cookies?: string[]) => {
      const req = request(app.getHttpServer()).get('/api/auth/check-status');
      return cookies ? req.set('Cookie', cookies) : req;
    };

    it('401: sin cookie de sesión', async () => {
      await get().expect(401);
    });

    it('401: cookie con un JWT mal formado', async () => {
      await get([`${ACCESS_TOKEN_COOKIE}=esto.no.es-un-jwt`]).expect(401);
    });

    it('401: cookie con un JWT firmado con otro secreto', async () => {
      const forged = new JwtService({ secret: 'otro-secreto' }).sign({
        id: 'admin',
      });

      await get([`${ACCESS_TOKEN_COOKIE}=${forged}`]).expect(401);
    });

    it('401: cookie con un JWT expirado', async () => {
      const expired = jwtService.sign({ id: 'usuario' }, { expiresIn: '-10s' });

      await get([`${ACCESS_TOKEN_COOKIE}=${expired}`]).expect(401);
    });

    it('401: el usuario del token ya no existe', async () => {
      await get([`${ACCESS_TOKEN_COOKIE}=${tokenFor('borrado')}`]).expect(401);
    });

    it('401: el usuario del token está inactivo', async () => {
      await get([`${ACCESS_TOKEN_COOKIE}=${tokenFor('inactivo')}`]).expect(401);
    });

    it('401: el JWT en la cabecera Authorization ya no autentica (solo cuenta la cookie)', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/check-status')
        .set('Authorization', `Bearer ${tokenFor('usuario')}`)
        .expect(401);
    });

    it('200: con la cookie válida devuelve { user } y renueva las cookies', async () => {
      const res = await get(sessionCookies('usuario').cookies).expect(200);

      expect(authBody(res).user.id).toBe('usuario');
      expectSessionCookies(res, 'usuario');
      expectBodyWithoutToken(res);
    });

    it('200: no exige token CSRF en una lectura (GET)', async () => {
      await get([`${ACCESS_TOKEN_COOKIE}=${tokenFor('usuario')}`]).expect(200);
    });
  });

  describe('POST /api/auth/logout', () => {
    const post = (cookies?: string[], csrfHeader?: string) => {
      let req = request(app.getHttpServer()).post('/api/auth/logout');
      if (cookies) req = req.set('Cookie', cookies);
      if (csrfHeader) req = req.set(CSRF_HEADER, csrfHeader);
      return req;
    };

    it('401: sin sesión', async () => {
      await post().expect(401);
    });

    it('403: con sesión pero sin cabecera X-CSRF-Token', async () => {
      await post(sessionCookies('usuario').cookies).expect(403);
    });

    it('403: con una cabecera X-CSRF-Token alterada', async () => {
      const { cookies, csrf } = sessionCookies('usuario');
      const [nonce, mac] = csrf.split('.');
      const tampered = `${nonce}.${(mac[0] === 'a' ? 'b' : 'a') + mac.slice(1)}`;

      await post(cookies, tampered).expect(403);
    });

    it('403: con el token CSRF de otro usuario', async () => {
      const { cookies } = sessionCookies('usuario');
      const foreign = tokenService.createCsrfToken('admin');

      await post(cookies, foreign).expect(403);
    });

    it('200: con CSRF válido responde { ok: true } y expira ambas cookies', async () => {
      const { cookies, csrf } = sessionCookies('usuario');

      const res = await post(cookies, csrf).expect(200);

      expect(res.body).toEqual({ ok: true });
      const access = setCookie(res, ACCESS_TOKEN_COOKIE);
      const csrfCookie = setCookie(res, CSRF_TOKEN_COOKIE);
      expect(access).toMatch(/^access_token=;/);
      expect(access).toMatch(/Path=\/api/);
      expect(access).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(csrfCookie).toMatch(/^csrf_token=;/);
      expect(csrfCookie).toMatch(/Path=\//);
      expect(csrfCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('Autorización por roles (AuthGuard + UserRoleGuard)', () => {
    const get = (path: string, userId?: string) => {
      const req = request(app.getHttpServer()).get(path);
      return userId ? req.set('Cookie', sessionCookies(userId).cookies) : req;
    };

    it('401: una ruta con rol exige autenticación antes que autorización', async () => {
      await get('/api/probe/admin').expect(401);
    });

    it('200: @Auth() sin roles admite a cualquier usuario autenticado', async () => {
      await get('/api/probe/any', 'usuario').expect(200);
    });

    it('403: un usuario con rol "user" no accede a una ruta de admin', async () => {
      await get('/api/probe/admin', 'usuario').expect(403);
    });

    it('200: un admin accede a la ruta de admin', async () => {
      await get('/api/probe/admin', 'admin').expect(200);
    });

    it('403: un super-user no accede a una ruta exclusiva de admin', async () => {
      await get('/api/probe/admin', 'staff').expect(403);
    });

    it('200: admin y super-user acceden a la ruta compartida; user no', async () => {
      await get('/api/probe/staff', 'admin').expect(200);
      await get('/api/probe/staff', 'staff').expect(200);
      await get('/api/probe/staff', 'usuario').expect(403);
    });
  });

  describe('Protección CSRF en rutas que modifican estado', () => {
    const send = (
      verb: 'post' | 'put' | 'patch' | 'delete',
      userId: string,
      csrfHeader?: string,
      path = '/api/probe/mutate',
    ) => {
      let req = request(app.getHttpServer())[verb](path);
      req = req.set('Cookie', sessionCookies(userId, csrfHeader).cookies);
      return csrfHeader ? req.set(CSRF_HEADER, csrfHeader) : req;
    };

    it.each(['post', 'put', 'patch', 'delete'] as const)(
      '%s sin X-CSRF-Token responde 403',
      async (verb) => {
        await send(verb, 'usuario').expect(403);
      },
    );

    it.each(['post', 'put', 'patch', 'delete'] as const)(
      '%s con X-CSRF-Token válido pasa (201 en POST, 200 en el resto)',
      async (verb) => {
        const res = await send(
          verb,
          'usuario',
          tokenService.createCsrfToken('usuario'),
        ).expect(verb === 'post' ? 201 : 200);

        expect((res.body as { verb: string }).verb).toBe(verb.toUpperCase());
      },
    );

    it('403: el token CSRF emitido para otro usuario no sirve', async () => {
      await send(
        'post',
        'usuario',
        tokenService.createCsrfToken('admin'),
      ).expect(403);
    });

    it('403: un token inventado no sirve aunque coincida con la cookie', async () => {
      await send('post', 'usuario', 'valor-inventado').expect(403);
    });

    it('403: el header correcto no basta si la cookie csrf_token no llega', async () => {
      const csrf = tokenService.createCsrfToken('usuario');

      await request(app.getHttpServer())
        .post('/api/probe/mutate')
        .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=${tokenFor('usuario')}`])
        .set(CSRF_HEADER, csrf)
        .expect(403);
    });

    it('401: sin sesión responde 401 antes de evaluar el CSRF', async () => {
      await request(app.getHttpServer()).post('/api/probe/mutate').expect(401);
    });

    it('403: rol insuficiente se evalúa antes que el CSRF, incluso con CSRF válido', async () => {
      await send(
        'post',
        'usuario',
        tokenService.createCsrfToken('usuario'),
        '/api/probe/mutate-admin',
      ).expect(403);
    });

    it('201: un admin con CSRF válido modifica en la ruta de admin', async () => {
      await send(
        'post',
        'admin',
        tokenService.createCsrfToken('admin'),
        '/api/probe/mutate-admin',
      ).expect(201);
    });
  });

  describe('CORS con credenciales (FRONTEND_URL)', () => {
    it('el preflight desde FRONTEND_URL permite credenciales y la cabecera X-CSRF-Token', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', FRONTEND_URL)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_URL);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toMatch(
        /X-CSRF-Token/i,
      );
    });

    it('nunca responde con comodín ni refleja un origen ajeno', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/check-status')
        .set('Origin', 'https://sitio-malicioso.example');

      expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_URL);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  describe('Rutas de prueba retiradas (ADR-003)', () => {
    it.each(['private', 'private2', 'private3'])(
      'GET /api/auth/%s ya no existe (404), ni siquiera con la sesión de un admin',
      async (route) => {
        await request(app.getHttpServer())
          .get(`/api/auth/${route}`)
          .set('Cookie', sessionCookies('admin').cookies)
          .expect(404);
      },
    );
  });
});
