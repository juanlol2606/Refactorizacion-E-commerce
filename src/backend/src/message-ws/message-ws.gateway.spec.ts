import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Socket } from 'socket.io';

import { ACCESS_TOKEN_COOKIE, WS_PATH } from '../auth/auth.constants';
import { TokenService } from '../auth/services/token.service';
import { CookieIoAdapter } from './cookie-io.adapter';
import { MessageWsGateway } from './message-ws.gateway';
import { MessageWsService } from './message-ws.service';

const JWT_SECRET = 'secreto-jwt-de-pruebas';

describe('MessageWsGateway (autenticación por cookie del handshake)', () => {
  const jwtService = new JwtService({
    secret: JWT_SECRET,
    signOptions: { expiresIn: '2h' },
  });
  const tokenService = new TokenService(
    jwtService,
    new ConfigService({ CSRF_SECRET: 'secreto-csrf-de-pruebas-1234' }),
  );

  const registerClient = jest.fn();
  const removeClient = jest.fn();
  const getConnectedClients = jest.fn();
  const emit = jest.fn();
  const disconnect = jest.fn();

  let gateway: MessageWsGateway;

  const clientWith = (headers: Record<string, string>) =>
    ({
      id: 'socket-1',
      handshake: { headers },
      disconnect,
    }) as unknown as Socket;

  beforeEach(() => {
    jest.resetAllMocks();
    getConnectedClients.mockReturnValue(['socket-1']);
    registerClient.mockResolvedValue(undefined);

    gateway = new MessageWsGateway(
      {
        registerClient,
        removeClient,
        getConnectedClients,
      } as unknown as MessageWsService,
      tokenService,
    );
    gateway.wss = { emit } as never;
  });

  it('conecta al cliente cuya cookie access_token trae un JWT válido', async () => {
    const jwt = tokenService.signAccessToken('u-1');
    const client = clientWith({
      cookie: `theme=dark; ${ACCESS_TOKEN_COOKIE}=${jwt}; csrf_token=n.m`,
    });

    await gateway.handleConnection(client);

    expect(registerClient).toHaveBeenCalledWith(client, 'u-1');
    expect(emit).toHaveBeenCalledWith('clients-updated', ['socket-1']);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('desconecta si el handshake no trae cookies', async () => {
    await gateway.handleConnection(clientWith({}));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(registerClient).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('desconecta si las cookies no incluyen access_token', async () => {
    await gateway.handleConnection(clientWith({ cookie: 'theme=dark' }));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('desconecta si el JWT de la cookie es inválido', async () => {
    await gateway.handleConnection(
      clientWith({ cookie: `${ACCESS_TOKEN_COOKIE}=esto.no.es-un-jwt` }),
    );

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('desconecta si el JWT está firmado con otro secreto', async () => {
    const forged = new JwtService({ secret: 'otro-secreto' }).sign({
      id: 'u-1',
    });

    await gateway.handleConnection(
      clientWith({ cookie: `${ACCESS_TOKEN_COOKIE}=${forged}` }),
    );

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('desconecta si el JWT expiró', async () => {
    const expired = jwtService.sign({ id: 'u-1' }, { expiresIn: '-10s' });

    await gateway.handleConnection(
      clientWith({ cookie: `${ACCESS_TOKEN_COOKIE}=${expired}` }),
    );

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('ya no acepta el token en la cabecera "authentication"', async () => {
    const jwt = tokenService.signAccessToken('u-1');

    await gateway.handleConnection(clientWith({ authentication: jwt }));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('desconecta si el usuario no existe o está inactivo', async () => {
    registerClient.mockRejectedValue(new Error('User not active'));
    const jwt = tokenService.signAccessToken('u-1');

    await gateway.handleConnection(
      clientWith({ cookie: `${ACCESS_TOKEN_COOKIE}=${jwt}` }),
    );

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('CookieIoAdapter', () => {
  it('fija el path /api/socket.io y el CORS con credenciales solo para FRONTEND_URL', () => {
    const createIOServer = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({});
    const adapter = new CookieIoAdapter({} as never, 'http://localhost:5173');

    adapter.createIOServer(0, { cors: { origin: '*' }, pingTimeout: 1234 });

    expect(createIOServer).toHaveBeenCalledWith(0, {
      pingTimeout: 1234,
      path: WS_PATH,
      cors: { origin: 'http://localhost:5173', credentials: true },
    });
    expect(WS_PATH).toBe('/api/socket.io');
    createIOServer.mockRestore();
  });
});
