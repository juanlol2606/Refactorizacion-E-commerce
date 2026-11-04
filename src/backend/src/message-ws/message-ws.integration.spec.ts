/**
 * Prueba de integración del WebSocket (ADR-004): un cliente Socket.IO real se
 * conecta a la aplicación en /api/socket.io y se autentica solo con la cookie
 * access_token del handshake. El repositorio de usuarios está simulado, por lo
 * que no se requiere PostgreSQL.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';

import { setupApp } from '../app.setup';
import { ACCESS_TOKEN_COOKIE, WS_PATH } from '../auth/auth.constants';
import { User } from '../auth/entities/user.entity';
import { TokenService } from '../auth/services/token.service';
import { MessageWsGateway } from './message-ws.gateway';
import { MessageWsService } from './message-ws.service';

const JWT_SECRET = 'secreto-de-pruebas-ws';
const FRONTEND_URL = 'http://localhost:5173';

describe('WebSocket (integración: cookie del handshake + /api/socket.io)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let port: number;
  const sockets: Socket[] = [];

  const users = new Map<string, Partial<User>>([
    ['ana', { id: 'ana', fullName: 'Ana Pérez', isActive: true }],
    ['inactivo', { id: 'inactivo', fullName: 'Inactivo', isActive: false }],
  ]);
  const userRepository = {
    findOneBy: jest.fn(({ id }: { id: string }) =>
      Promise.resolve(users.get(id) ?? null),
    ),
  };

  const jwtFor = (id: string) => jwtService.sign({ id });

  const connect = (headers: Record<string, string> = {}) => {
    const socket = io(`http://localhost:${port}`, {
      path: WS_PATH,
      transports: ['websocket'],
      extraHeaders: headers,
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  };

  const once = <T = unknown>(socket: Socket, event: string, ms = 4000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Tiempo agotado esperando "${event}"`)),
        ms,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET,
              CSRF_SECRET: 'secreto-csrf-de-pruebas-ws-1234',
              FRONTEND_URL,
            }),
          ],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>('JWT_SECRET'),
            signOptions: { expiresIn: '2h' },
          }),
        }),
      ],
      providers: [
        MessageWsGateway,
        MessageWsService,
        TokenService,
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.listen(0);

    port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
    jwtService = moduleRef.get(JwtService);
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()?.close();
  });

  afterAll(async () => {
    await app.close();
  });

  it('conecta con la cookie access_token válida y recibe clients-updated', async () => {
    const cookie = `${ACCESS_TOKEN_COOKIE}=${jwtFor('ana')}`;
    const socket = connect({ cookie });
    const updated = once<string[]>(socket, 'clients-updated');

    await once(socket, 'connect');

    await expect(updated).resolves.toContain(socket.id);
  });

  it('un mensaje se difunde con el nombre del usuario autenticado por la cookie', async () => {
    const socket = connect({
      cookie: `${ACCESS_TOKEN_COOKIE}=${jwtFor('ana')}`,
    });
    await once(socket, 'clients-updated');

    const message = once<{ fullName: string; message: string }>(
      socket,
      'message-from-server',
    );
    socket.emit('message-from-client', { message: 'hola' });

    await expect(message).resolves.toEqual({
      fullName: 'Ana Pérez',
      message: 'hola',
    });
  });

  it.each([
    ['sin cookies', {}],
    [
      'con una cookie de sesión inválida',
      { cookie: `${ACCESS_TOKEN_COOKIE}=basura` },
    ],
    [
      'con un JWT firmado con otro secreto',
      {
        cookie: `${ACCESS_TOKEN_COOKIE}=${new JwtService({ secret: 'otro' }).sign({ id: 'ana' })}`,
      },
    ],
  ])('el servidor desconecta al cliente %s', async (_name, headers) => {
    const socket = connect(headers);
    const closed = once<string>(socket, 'disconnect');

    await expect(closed).resolves.toBe('io server disconnect');
  });

  it('desconecta con un JWT expirado', async () => {
    const expired = jwtService.sign({ id: 'ana' }, { expiresIn: '-10s' });
    const socket = connect({ cookie: `${ACCESS_TOKEN_COOKIE}=${expired}` });

    await expect(once<string>(socket, 'disconnect')).resolves.toBe(
      'io server disconnect',
    );
  });

  it('desconecta a un usuario inactivo', async () => {
    const socket = connect({
      cookie: `${ACCESS_TOKEN_COOKIE}=${jwtFor('inactivo')}`,
    });

    await expect(once<string>(socket, 'disconnect')).resolves.toBe(
      'io server disconnect',
    );
  });

  it('el token en la antigua cabecera "authentication" ya no sirve', async () => {
    const socket = connect({ authentication: jwtFor('ana') });

    await expect(once<string>(socket, 'disconnect')).resolves.toBe(
      'io server disconnect',
    );
  });

  it('la ruta antigua /socket.io ya no existe (solo /api/socket.io)', async () => {
    await request(`http://localhost:${port}`)
      .get('/socket.io/?EIO=4&transport=polling')
      .expect(404);
  });

  it('el handshake desde FRONTEND_URL permite credenciales (CORS)', async () => {
    const res = await request(`http://localhost:${port}`)
      .get(`${WS_PATH}/?EIO=4&transport=polling`)
      .set('Origin', FRONTEND_URL)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_URL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
