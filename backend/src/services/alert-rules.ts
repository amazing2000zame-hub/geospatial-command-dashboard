import type { CacheService } from './cache.js';
import type { Namespace } from 'socket.io';
import type { LayerFeatureCollection, LayerFeature } from '../types/geojson.js';
import { randomUUID } from 'node:crypto';

// ── Types ──

export interface AlertCondition {
  field: string; // property path like 'severity', 'properties.magnitude', 'category'
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  value: string | number;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  layerId: string;
  conditions: AlertCondition[];
  location?: {
    lat: number;
    lng: number;
    radiusKm: number;
  };
  notify: {
    websocket: boolean;
    telegram: boolean;
  };
  cooldownMinutes: number;
  lastTriggered?: number;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  layerId: string;
  matchedFeatures: { id: string; label: string; coordinates: [number, number] }[];
  timestamp: number;
  message: string;
}

// ── Helpers ──

const REDIS_RULES_KEY = 'alert:rules';
const REDIS_EVENTS_KEY = 'alert:events';
const MAX_EVENTS = 100;

const TELEGRAM_BOT_TOKEN = '8289970213:AAH4O-sedpTPK6YfCi0ghUpNJeiYSgV8JMY';
const TELEGRAM_CHAT_ID = '8231301805';

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Resolve a dotted property path on an object.
 * e.g. getNestedValue({ properties: { magnitude: 5.2 } }, 'properties.magnitude') => 5.2
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function matchesCondition(
  feature: LayerFeature,
  condition: AlertCondition,
): boolean {
  const raw = getNestedValue(
    feature as unknown as Record<string, unknown>,
    condition.field.startsWith('properties.')
      ? condition.field
      : `properties.${condition.field}`,
  );

  if (raw === undefined || raw === null) return false;

  const { operator, value } = condition;

  switch (operator) {
    case 'gt':
      return typeof raw === 'number' && raw > Number(value);
    case 'lt':
      return typeof raw === 'number' && raw < Number(value);
    case 'eq':
      return String(raw).toLowerCase() === String(value).toLowerCase();
    case 'contains':
      return String(raw).toLowerCase().includes(String(value).toLowerCase());
    default:
      return false;
  }
}

function extractCoordinates(feature: LayerFeature): [number, number] | null {
  const geom = feature.geometry;
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const coords = geom.coordinates as number[];
    if (coords.length >= 2) {
      return [coords[0], coords[1]]; // [lng, lat]
    }
  }
  return null;
}

async function sendTelegramMessage(text: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error(
      '[alert-rules] Telegram send failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

// ── Engine ──

export class AlertRulesEngine {
  private cache: CacheService;
  private io: Namespace;

  constructor(cache: CacheService, io: Namespace) {
    this.cache = cache;
    this.io = io;
  }

  // ── CRUD ──

  async getRules(): Promise<AlertRule[]> {
    const raw = await this.cache.getRaw<AlertRule[]>(REDIS_RULES_KEY);
    return raw ?? [];
  }

  async addRule(
    input: Omit<AlertRule, 'id' | 'createdAt'>,
  ): Promise<AlertRule> {
    const rules = await this.getRules();
    const rule: AlertRule = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    rules.push(rule);
    await this.saveRules(rules);
    console.log(`[alert-rules] Created rule "${rule.name}" (${rule.id})`);
    return rule;
  }

  async updateRule(
    id: string,
    updates: Partial<AlertRule>,
  ): Promise<AlertRule | null> {
    const rules = await this.getRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    // Prevent overwriting id/createdAt
    const { id: _id, createdAt: _ca, ...safe } = updates;
    rules[idx] = { ...rules[idx], ...safe };
    await this.saveRules(rules);
    console.log(`[alert-rules] Updated rule "${rules[idx].name}" (${id})`);
    return rules[idx];
  }

  async deleteRule(id: string): Promise<boolean> {
    const rules = await this.getRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;

    const removed = rules.splice(idx, 1)[0];
    await this.saveRules(rules);
    console.log(`[alert-rules] Deleted rule "${removed.name}" (${id})`);
    return true;
  }

  // ── Evaluation ──

  async evaluate(
    layerId: string,
    data: LayerFeatureCollection,
  ): Promise<void> {
    const rules = await this.getRules();
    const activeRules = rules.filter(
      (r) => r.enabled && r.layerId === layerId,
    );

    if (activeRules.length === 0) return;

    let rulesModified = false;

    for (const rule of activeRules) {
      // Check cooldown
      if (rule.lastTriggered) {
        const elapsed = Date.now() - rule.lastTriggered;
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        if (elapsed < cooldownMs) continue;
      }

      // Filter features by conditions
      let matched = data.features.filter((feature) =>
        rule.conditions.every((cond) => matchesCondition(feature, cond)),
      );

      // Filter by location if set
      if (rule.location && matched.length > 0) {
        matched = matched.filter((feature) => {
          const coords = extractCoordinates(feature);
          if (!coords) return false;
          const [lng, lat] = coords;
          const dist = haversineKm(
            rule.location!.lat,
            rule.location!.lng,
            lat,
            lng,
          );
          return dist <= rule.location!.radiusKm;
        });
      }

      if (matched.length === 0) continue;

      // Build alert event
      const matchedSummary = matched.slice(0, 10).map((f) => {
        const coords = extractCoordinates(f);
        return {
          id: f.properties.id,
          label: f.properties.label || 'Unknown',
          coordinates: (coords ?? [0, 0]) as [number, number],
        };
      });

      const alertEvent: AlertEvent = {
        id: randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layerId,
        matchedFeatures: matchedSummary,
        timestamp: Date.now(),
        message: `Rule "${rule.name}" matched ${matched.length} feature(s) on layer ${layerId}`,
      };

      // Store event
      await this.pushEvent(alertEvent);

      // Emit via WebSocket
      if (rule.notify.websocket) {
        this.io.emit('alert', alertEvent);
      }

      // Send Telegram notification
      if (rule.notify.telegram) {
        const featureList = matchedSummary
          .slice(0, 5)
          .map((f) => `  - ${f.label} (${f.coordinates[1].toFixed(2)}, ${f.coordinates[0].toFixed(2)})`)
          .join('\n');

        const text =
          `*ALERT: ${rule.name}*\n` +
          `Layer: \`${layerId}\`\n` +
          `Matched: ${matched.length} feature(s)\n\n` +
          `${featureList}` +
          (matched.length > 5 ? `\n  ...and ${matched.length - 5} more` : '');

        void sendTelegramMessage(text);
      }

      // Update cooldown timestamp
      rule.lastTriggered = Date.now();
      rulesModified = true;

      console.log(
        `[alert-rules] Rule "${rule.name}" triggered: ${matched.length} matches on ${layerId}`,
      );
    }

    if (rulesModified) {
      await this.saveRules(rules);
    }
  }

  // ── Recent Alerts ──

  async getRecentAlerts(limit = 50): Promise<AlertEvent[]> {
    const events =
      await this.cache.getRaw<AlertEvent[]>(REDIS_EVENTS_KEY);
    if (!events) return [];
    return events.slice(-limit).reverse();
  }

  // ── Private Helpers ──

  private async saveRules(rules: AlertRule[]): Promise<void> {
    // No TTL — rules persist until explicitly deleted (use 30-day TTL as safety net)
    await this.cache.setRaw(REDIS_RULES_KEY, rules, 60 * 60 * 24 * 30);
  }

  private async pushEvent(event: AlertEvent): Promise<void> {
    const events =
      (await this.cache.getRaw<AlertEvent[]>(REDIS_EVENTS_KEY)) ?? [];
    events.push(event);

    // Keep only the last MAX_EVENTS
    const trimmed = events.slice(-MAX_EVENTS);
    await this.cache.setRaw(REDIS_EVENTS_KEY, trimmed, 60 * 60 * 24 * 7);
  }
}
