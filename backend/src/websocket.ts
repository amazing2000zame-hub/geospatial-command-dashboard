import type { WebSocket } from 'ws';

export function broadcastToClients(message: any) {
  const clients = (global as any).wsClients as Set<WebSocket> | undefined;
  if (!clients) return;

  const messageStr = JSON.stringify(message);
  const deadClients = new Set<WebSocket>();

  clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      try {
        client.send(messageStr);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
        deadClients.add(client);
      }
    } else {
      deadClients.add(client);
    }
  });

  // Clean up dead connections
  deadClients.forEach((client) => clients.delete(client));
}
