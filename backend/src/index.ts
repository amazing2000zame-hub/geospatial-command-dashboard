import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Health check
app.get('/api/health', async () => {
  return {
    status: 'ok',
    timestamp: Date.now(),
  };
});

// Start server
const PORT = parseInt(process.env.PORT || '4010', 10);
const HOST = '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Backend running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
