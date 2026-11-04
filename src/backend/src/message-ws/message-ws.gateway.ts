import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { TokenService } from '../auth/services/token.service';
import { NewMessageDto } from './dtos/new-message.dto';
import { MessageWsService } from './message-ws.service';

/**
 * El path (/api/socket.io) y el CORS con credenciales los fija CookieIoAdapter
 * al arrancar la aplicación. La sesión se autentica con la cookie httpOnly
 * `access_token` que el navegador envía en el handshake (ADR-004).
 */
@WebSocketGateway()
export class MessageWsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() wss: Server;

  constructor(
    private readonly messageWsService: MessageWsService,
    private readonly tokenService: TokenService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.tokenService.getAccessTokenFromCookieHeader(
      client.handshake.headers.cookie,
    );

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      await this.messageWsService.registerClient(client, payload.id);
    } catch {
      client.disconnect();
      return;
    }

    this.wss.emit(
      'clients-updated',
      this.messageWsService.getConnectedClients(),
    );
  }

  handleDisconnect(client: Socket) {
    this.messageWsService.removeClient(client.id);

    this.wss.emit(
      'clients-updated',
      this.messageWsService.getConnectedClients(),
    );
  }

  @SubscribeMessage('message-from-client')
  onMessageFromClient(client: Socket, payload: NewMessageDto) {
    // Emits only to the client
    // client.emit('message-from-server', {
    //   fullName: 'Soy yo',
    //   message: payload.message || 'no message',
    // });

    // Emit to everyone but the inital client
    // client.broadcast.emit('message-from-server', {
    //   fullName: 'Soy yo',
    //   message: payload.message || 'no message',
    // });

    this.wss.emit('message-from-server', {
      fullName: this.messageWsService.getUserFullName(client.id),
      message: payload.message || 'no message',
    });
  }
}
