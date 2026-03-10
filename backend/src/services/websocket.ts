import { Server as SocketIOServer, type Namespace } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { CacheService } from './cache.js';

export interface WebSocketResult {
  io: SocketIOServer;
  layerNs: Namespace;
}

export function setupWebSocket(
  httpServer: HttpServer,
  cache: CacheService,
): WebSocketResult {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    path: '/socket.io',
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  const layerNs = io.of('/layers');

  layerNs.on('connection', (socket) => {
    console.log(`[ws] Client connected: ${socket.id}`);

    socket.on('subscribe', async (layerId: string) => {
      const room = `layer:${layerId}`;
      await socket.join(room);
      console.log(`[ws] ${socket.id} subscribed to ${room}`);

      // Send cached data immediately on subscribe
      try {
        const cached = await cache.get(layerId);
        if (cached) {
          socket.emit('data', {
            layerId,
            data: cached,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error(`[ws] Error sending cached data for ${layerId}:`, err);
      }
    });

    socket.on('unsubscribe', async (layerId: string) => {
      const room = `layer:${layerId}`;
      await socket.leave(room);
      console.log(`[ws] ${socket.id} unsubscribed from ${room}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[ws] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[ws] Socket.IO initialized with /layers namespace');
  return { io, layerNs };
}
