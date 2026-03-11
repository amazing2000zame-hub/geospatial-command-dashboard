import type { FastifyInstance } from 'fastify';
import type { AlertRulesEngine, AlertRule } from '../services/alert-rules.js';

export function registerAlertRoutes(
  fastify: FastifyInstance,
  engine: AlertRulesEngine,
): void {
  // List all rules
  fastify.get('/api/alerts/rules', async () => {
    const rules = await engine.getRules();
    return { rules };
  });

  // Create a new rule
  fastify.post<{
    Body: Omit<AlertRule, 'id' | 'createdAt'>;
  }>('/api/alerts/rules', async (request, reply) => {
    const body = request.body;
    if (!body || !body.name || !body.layerId) {
      return reply
        .status(400)
        .send({ error: 'Missing required fields: name, layerId' });
    }

    const rule = await engine.addRule(body);
    return reply.status(201).send({ rule });
  });

  // Update an existing rule
  fastify.put<{
    Params: { id: string };
    Body: Partial<AlertRule>;
  }>('/api/alerts/rules/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    const rule = await engine.updateRule(id, updates);
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found', id });
    }

    return { rule };
  });

  // Delete a rule
  fastify.delete<{
    Params: { id: string };
  }>('/api/alerts/rules/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = await engine.deleteRule(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Rule not found', id });
    }

    return { ok: true };
  });

  // List recent alert events
  fastify.get<{
    Querystring: { limit?: string };
  }>('/api/alerts/events', async (request) => {
    const limit = request.query.limit
      ? parseInt(request.query.limit, 10)
      : 50;
    const events = await engine.getRecentAlerts(limit);
    return { events };
  });
}
