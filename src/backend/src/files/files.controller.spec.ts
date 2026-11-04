/**
 * Pruebas HTTP de FilesController (ADR-004 y endurecimiento): la lectura de
 * imágenes es pública, pero la subida exige sesión, rol admin y token CSRF.
 * No se sube ninguna imagen real, así que no se escribe nada en static/.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { setupApp } from '../app.setup';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_HEADER,
  CSRF_TOKEN_COOKIE,
} from '../auth/auth.constants';
import { User } from '../auth/entities/user.entity';
import { TokenService } from '../auth/services/token.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

describe('FilesController (HTTP)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let tokenService: TokenService;

  const users = new Map<string, Partial<User>>([
    ['usuario', { id: 'usuario', isActive: true, roles: ['user'] }],
    ['admin', { id: 'admin', isActive: true, roles: ['admin'] }],
  ]);

  const cookiesFor = (id: string, csrf = tokenService.createCsrfToken(id)) => [
    `${ACCESS_TOKEN_COOKIE}=${jwtService.sign({ id })}`,
    `${CSRF_TOKEN_COOKIE}=${csrf}`,
  ];

  const upload = () =>
    request(app.getHttpServer())
      .post('/api/files/product')
      .attach('file', Buffer.from('esto no es una imagen'), {
        filename: 'nota.txt',
        contentType: 'text/plain',
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 'secreto-de-pruebas-de-archivos',
              CSRF_SECRET: 'secreto-csrf-de-pruebas-de-archivos',
              HOST_API: 'http://localhost:3000/api',
            }),
          ],
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
      controllers: [FilesController],
      providers: [
        FilesService,
        JwtStrategy,
        TokenService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneBy: ({ id }: { id: string }) =>
              Promise.resolve(users.get(id) ?? null),
          },
        },
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

  describe('GET /api/files/product/:imageName (público)', () => {
    it('200: sirve una imagen existente sin necesidad de sesión', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/files/product/1740280-00-A_0_2000.jpg')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('400: una imagen que no existe', async () => {
      await request(app.getHttpServer())
        .get('/api/files/product/no-existe.jpg')
        .expect(400);
    });

    it('no permite salir de static/products con ../ (no devuelve el archivo)', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/files/product/..%2F..%2Fpackage.json',
      );

      expect(res.status).not.toBe(200);
      expect(res.text).not.toContain('"scripts"');
    });
  });

  describe('POST /api/files/product (solo admin con CSRF)', () => {
    it('401: sin sesión', async () => {
      await upload().expect(401);
    });

    it('403: un usuario sin rol admin, aunque envíe el CSRF correcto', async () => {
      const csrf = tokenService.createCsrfToken('usuario');

      await upload()
        .set('Cookie', cookiesFor('usuario', csrf))
        .set(CSRF_HEADER, csrf)
        .expect(403);
    });

    it('403: un admin sin la cabecera X-CSRF-Token', async () => {
      await upload().set('Cookie', cookiesFor('admin')).expect(403);
    });

    it('403: un admin con un X-CSRF-Token de otro usuario', async () => {
      const foreign = tokenService.createCsrfToken('usuario');

      await upload()
        .set('Cookie', cookiesFor('admin', foreign))
        .set(CSRF_HEADER, foreign)
        .expect(403);
    });

    it('400: un admin con CSRF válido llega al controlador y se rechaza un archivo que no es imagen', async () => {
      const csrf = tokenService.createCsrfToken('admin');

      await upload()
        .set('Cookie', cookiesFor('admin', csrf))
        .set(CSRF_HEADER, csrf)
        .expect(400);
    });
  });
});
