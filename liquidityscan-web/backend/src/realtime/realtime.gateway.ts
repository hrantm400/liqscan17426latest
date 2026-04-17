import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { CandlesService } from '../candles/candles.service';

type RoomKey = string; // `${symbol}::${timeframe}`

function normalizeSymbol(symbol: string): string {
  return (symbol || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

function normalizeTimeframe(tf: string): string {
  return (tf || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function makeRoomKey(symbol: string, timeframe: string): RoomKey {
  return `${symbol}::${timeframe}`;
}

/** Match HTTP CORS in main.ts — FRONTEND_URL comma-separated */
function websocketCorsOrigins(): string[] {
  const raw = process.env.FRONTEND_URL;
  if (!raw) return ['http://localhost:5173'];
  return raw.split(',').map((u) => u.trim()).filter(Boolean);
}

@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: websocketCorsOrigins(), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  private roomSubscribers = new Map<RoomKey, number>();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly candlesService: CandlesService,
    private readonly jwtService: JwtService,
  ) {
    this.ensurePolling();
  }

  handleConnection(socket: Socket) {
    const raw = socket.handshake.auth?.['token'] ?? socket.handshake.query?.['token'];
    const token =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (!token) {
      this.logger.warn(`WS rejected ${socket.id}: missing token`);
      socket.disconnect(true);
      return;
    }
    try {
      const payload = this.jwtService.verify<{ sub?: string; userId?: string; id?: string }>(token);
      const userId = payload.sub || payload.userId || payload.id;
      if (!userId) {
        this.logger.warn(`WS rejected ${socket.id}: token without subject`);
        socket.disconnect(true);
        return;
      }
      (socket.data as { userId?: string }).userId = userId;
      this.logger.debug(`Client connected ${socket.id}`);
    } catch {
      this.logger.warn(`WS rejected ${socket.id}: invalid token`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    // Best-effort cleanup: decrement counts for rooms this socket was in.
    // socket.rooms includes the socket.id itself; ignore that.
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      this.decRoom(room);
    }
    this.logger.debug(`Client disconnected ${socket.id}`);
  }

  @SubscribeMessage('subscribe:symbol')
  async onSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { symbol: string; timeframe: string },
  ) {
    if (!(socket.data as { userId?: string }).userId) return;

    const symbol = normalizeSymbol(body?.symbol);
    const timeframe = normalizeTimeframe(body?.timeframe);
    if (!symbol || !timeframe) return;

    const room = makeRoomKey(symbol, timeframe);
    socket.join(room);
    this.incRoom(room);
  }

  @SubscribeMessage('unsubscribe:symbol')
  async onUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { symbol: string; timeframe: string },
  ) {
    if (!(socket.data as { userId?: string }).userId) return;

    const symbol = normalizeSymbol(body?.symbol);
    const timeframe = normalizeTimeframe(body?.timeframe);
    if (!symbol || !timeframe) return;

    const room = makeRoomKey(symbol, timeframe);
    socket.leave(room);
    this.decRoom(room);
  }

  private incRoom(room: RoomKey) {
    this.roomSubscribers.set(room, (this.roomSubscribers.get(room) || 0) + 1);
  }

  private decRoom(room: RoomKey) {
    const curr = this.roomSubscribers.get(room) || 0;
    if (curr <= 1) this.roomSubscribers.delete(room);
    else this.roomSubscribers.set(room, curr - 1);
  }

  private ensurePolling() {
    if (this.pollTimer) return;
    // Poll every 3s for active rooms.
    this.pollTimer = setInterval(() => this.pollOnce(), 3000);
  }

  private async pollOnce() {
    if (!this.server) return;
    if (this.roomSubscribers.size === 0) return;

    const rooms = Array.from(this.roomSubscribers.keys());
    await Promise.all(
      rooms.map(async (room) => {
        const [symbol, timeframe] = room.split('::');
        if (!symbol || !timeframe) return;
        const candles = await this.candlesService.getKlines(symbol, timeframe, 2);
        const last = candles?.[candles.length - 1];
        if (!last) return;
        this.server.to(room).emit('candle:update', {
          symbol,
          timeframe,
          ...last,
        });
      }),
    );
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

