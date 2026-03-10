import { Server as SocketIOServer, type Namespace } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { CacheService } from './cache.js';

/** Redis keys for intel panel data */
const INTEL_KEYS = {
  news: 'intel:news',
  economy: 'intel:economy',
  situations: 'intel:situations',
} as const;

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

    // --- Intel Panel subscription ---
    socket.on('subscribe-intel', async () => {
      await socket.join('intel');
      console.log(`[ws] ${socket.id} subscribed to intel panel`);

      // Send all cached intel data immediately
      for (const [channel, redisKey] of Object.entries(INTEL_KEYS)) {
        try {
          const cached = await cache.getRaw(redisKey);
          if (cached) {
            socket.emit('intel-data', {
              channel,
              data: cached,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error(
            `[ws] Error sending cached intel data for ${channel}:`,
            err,
          );
        }
      }
    });

    socket.on('unsubscribe-intel', async () => {
      await socket.leave('intel');
      console.log(`[ws] ${socket.id} unsubscribed from intel panel`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[ws] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[ws] Socket.IO initialized with /layers namespace');
  return { io, layerNs };
}
