import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// ── Types ──

interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  value: string | number;
}

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  layerId: string;
  conditions: AlertCondition[];
  location?: { lat: number; lng: number; radiusKm: number };
  notify: { websocket: boolean; telegram: boolean };
  cooldownMinutes: number;
  lastTriggered?: number;
  createdAt: number;
}

interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  layerId: string;
  matchedFeatures: { id: string; label: string; coordinates: [number, number] }[];
  timestamp: number;
  message: string;
}

// ── Constants ──

const LAYER_OPTIONS = [
  { id: 'earthquakes', label: 'Earthquakes' },
  { id: 'weather', label: 'Weather Alerts' },
  { id: 'conflict_events', label: 'Conflict Events' },
  { id: 'active_fires', label: 'Active Fires' },
  { id: 'crime_incidents', label: 'Crime Incidents' },
  { id: 'dispatch', label: 'Fire/EMS Dispatch' },
];

const FIELD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  earthquakes: [
    { value: 'severity', label: 'Magnitude' },
    { value: 'category', label: 'Category' },
    { value: 'label', label: 'Label' },
  ],
  weather: [
    { value: 'severity', label: 'Severity' },
    { value: 'category', label: 'Category' },
    { value: 'label', label: 'Label' },
  ],
  conflict_events: [
    { value: 'severity', label: 'Severity' },
    { value: 'category', label: 'Category' },
    { value: 'label', label: 'Label' },
  ],
  active_fires: [
    { value: 'severity', label: 'Confidence' },
    { value: 'category', label: 'Category' },
    { value: 'label', label: 'Label' },
  ],
  crime_incidents: [
    { value: 'severity', label: 'Severity' },
    { value: 'category', label: 'Category' },
    { value: 'label', label: 'Description' },
  ],
  dispatch: [
    { value: 'severity', label: 'Severity' },
    { value: 'category', label: 'Category' },
    { value: 'label', label: 'Label' },
  ],
};

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>',
  lt: '<',
  eq: '=',
  contains: 'contains',
};

const COOLDOWN_OPTIONS = [1, 5, 15, 30, 60, 120, 360];

const API_BASE = '';

// ── Styles ──

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    left: 16,
    top: 460,
    width: 320,
    maxHeight: 'calc(100vh - 480px)',
    zIndex: 1100,
    background: 'rgba(10, 18, 26, 0.92)',
    border: '1px solid rgba(0, 200, 210, 0.15)',
    borderRadius: 10,
    overflow: 'hidden',
    backdropFilter: 'blur(16px)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    color: '#c8d0d8',
    fontSize: 11,
  },
  collapsed: {
    position: 'fixed',
    left: 16,
    top: 460,
    zIndex: 1100,
    background: 'rgba(10, 18, 26, 0.92)',
    border: '1px solid rgba(0, 200, 210, 0.15)',
    borderRadius: 10,
    padding: '8px 12px',
    cursor: 'pointer',
    backdropFilter: 'blur(16px)',
    fontFamily: "'JetBrains Mono', monospace",
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  collapsedLabel: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: '#6a7580',
    textTransform: 'uppercase' as const,
  },
  collapsedArrow: {
    fontSize: 10,
    color: '#00c8d2',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(0, 200, 210, 0.15)',
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#00c8d2',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#6a7580',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(0, 200, 210, 0.1)',
  },
  tab: {
    flex: 1,
    padding: '6px 8px',
    border: 'none',
    background: 'transparent',
    color: '#6a7580',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'rgba(0, 200, 210, 0.12)',
    color: '#00c8d2',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    minHeight: 120,
    maxHeight: 'calc(100vh - 580px)',
  },
  empty: {
    padding: '24px 16px',
    textAlign: 'center' as const,
    color: '#3a4550',
    fontSize: 10,
    letterSpacing: 1,
  },
  ruleItem: {
    padding: '8px 10px',
    borderBottom: '1px solid rgba(0, 200, 210, 0.06)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  ruleInfo: {
    flex: 1,
    minWidth: 0,
  },
  ruleName: {
    fontSize: 10,
    color: '#c8d0d8',
    letterSpacing: 0.5,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  ruleMeta: {
    fontSize: 8,
    color: '#3a4550',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  toggle: {
    width: 30,
    height: 16,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.1)',
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'background 0.2s',
    border: 'none',
    flexShrink: 0,
  },
  toggleOn: {
    background: '#00c8d2',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#ff4444',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 4px',
    opacity: 0.6,
    flexShrink: 0,
  },
  newBtn: {
    display: 'block',
    width: 'calc(100% - 20px)',
    margin: '8px 10px',
    padding: '6px 0',
    border: '1px solid rgba(0, 200, 210, 0.3)',
    borderRadius: 5,
    background: 'rgba(0, 200, 210, 0.06)',
    color: '#00c8d2',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  form: {
    padding: '10px',
    borderTop: '1px solid rgba(0, 200, 210, 0.1)',
  },
  formGroup: {
    marginBottom: 8,
  },
  formLabel: {
    display: 'block',
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: '#3a4550',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid rgba(0, 200, 210, 0.15)',
    borderRadius: 4,
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#c8d0d8',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid rgba(0, 200, 210, 0.15)',
    borderRadius: 4,
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#c8d0d8',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  conditionRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 4,
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    color: '#6a7580',
    cursor: 'pointer',
    marginRight: 12,
  },
  notifyRow: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  locationRow: {
    display: 'flex',
    gap: 4,
  },
  formActions: {
    display: 'flex',
    gap: 6,
    marginTop: 10,
  },
  saveBtn: {
    flex: 1,
    padding: '6px 0',
    border: 'none',
    borderRadius: 4,
    background: '#00c8d2',
    color: '#0a0e14',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },
  cancelBtn: {
    flex: 1,
    padding: '6px 0',
    border: '1px solid rgba(0, 200, 210, 0.2)',
    borderRadius: 4,
    background: 'transparent',
    color: '#6a7580',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },
  eventItem: {
    padding: '8px 10px',
    borderBottom: '1px solid rgba(0, 200, 210, 0.06)',
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventRuleName: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: '#ff4444',
  },
  eventTime: {
    fontSize: 8,
    color: '#3a4550',
  },
  eventMessage: {
    fontSize: 10,
    color: '#c8d0d8',
    lineHeight: 1.4,
  },
  eventFeatures: {
    fontSize: 8,
    color: '#6a7580',
    marginTop: 3,
    lineHeight: 1.4,
  },
  badge: {
    fontSize: 8,
    background: 'rgba(0, 200, 210, 0.4)',
    color: '#0a0e14',
    padding: '1px 4px',
    borderRadius: 3,
    fontWeight: 700,
    marginLeft: 4,
  },
};

// ── Socket singleton ──

let alertSocket: Socket | null = null;

function getAlertSocket(): Socket {
  if (!alertSocket) {
    alertSocket = io('/layers', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
  }
  return alertSocket;
}

// ── Helpers ──

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const hr = Math.floor(diff / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ── Component ──

type ViewTab = 'rules' | 'events';

function AlertRules() {
  const [collapsed, setCollapsed] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>('rules');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const flashRef = useRef<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formLayer, setFormLayer] = useState(LAYER_OPTIONS[0].id);
  const [formField, setFormField] = useState('severity');
  const [formOp, setFormOp] = useState<AlertCondition['operator']>('gt');
  const [formValue, setFormValue] = useState('');
  const [formLocationEnabled, setFormLocationEnabled] = useState(false);
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [formRadius, setFormRadius] = useState('100');
  const [formNotifyWs, setFormNotifyWs] = useState(true);
  const [formNotifyTg, setFormNotifyTg] = useState(false);
  const [formCooldown, setFormCooldown] = useState(15);

  // Fetch rules
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts/rules`);
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules ?? []);
      }
    } catch {
      /* silently fail */
    }
  }, []);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts/events?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      /* silently fail */
    }
  }, []);

  // Initial load + periodic refresh
  useEffect(() => {
    fetchRules();
    fetchEvents();
    const interval = setInterval(() => {
      fetchRules();
      fetchEvents();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchRules, fetchEvents]);

  // Listen for real-time alerts via WebSocket
  useEffect(() => {
    const socket = getAlertSocket();

    function onAlert(event: AlertEvent) {
      setEvents((prev) => [event, ...prev].slice(0, 100));
      flashRef.current = event.id;
      // Auto-switch to events tab on new alert
      setViewTab('events');
      if (collapsed) setCollapsed(false);
    }

    socket.on('alert', onAlert);
    return () => {
      socket.off('alert', onAlert);
    };
  }, [collapsed]);

  // Toggle rule enabled/disabled
  const toggleRule = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await fetch(`${API_BASE}/api/alerts/rules/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        setRules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, enabled } : r)),
        );
      } catch {
        /* silently fail */
      }
    },
    [],
  );

  // Delete rule
  const deleteRule = useCallback(
    async (id: string) => {
      try {
        await fetch(`${API_BASE}/api/alerts/rules/${id}`, {
          method: 'DELETE',
        });
        setRules((prev) => prev.filter((r) => r.id !== id));
      } catch {
        /* silently fail */
      }
    },
    [],
  );

  // Create rule
  const createRule = useCallback(async () => {
    if (!formName.trim() || !formValue.trim()) return;

    setLoading(true);
    try {
      const condValue =
        formOp === 'gt' || formOp === 'lt' ? Number(formValue) : formValue;

      const body: Record<string, unknown> = {
        name: formName.trim(),
        enabled: true,
        layerId: formLayer,
        conditions: [{ field: formField, operator: formOp, value: condValue }],
        notify: { websocket: formNotifyWs, telegram: formNotifyTg },
        cooldownMinutes: formCooldown,
      };

      if (formLocationEnabled && formLat && formLng && formRadius) {
        body.location = {
          lat: Number(formLat),
          lng: Number(formLng),
          radiusKm: Number(formRadius),
        };
      }

      const res = await fetch(`${API_BASE}/api/alerts/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setRules((prev) => [...prev, data.rule]);
        resetForm();
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, [
    formName,
    formLayer,
    formField,
    formOp,
    formValue,
    formLocationEnabled,
    formLat,
    formLng,
    formRadius,
    formNotifyWs,
    formNotifyTg,
    formCooldown,
  ]);

  const resetForm = useCallback(() => {
    setShowForm(false);
    setFormName('');
    setFormLayer(LAYER_OPTIONS[0].id);
    setFormField('severity');
    setFormOp('gt');
    setFormValue('');
    setFormLocationEnabled(false);
    setFormLat('');
    setFormLng('');
    setFormRadius('100');
    setFormNotifyWs(true);
    setFormNotifyTg(false);
    setFormCooldown(15);
  }, []);

  // Update available fields when layer changes
  useEffect(() => {
    const fields = FIELD_OPTIONS[formLayer];
    if (fields && fields.length > 0) {
      setFormField(fields[0].value);
    }
  }, [formLayer]);

  // ── Collapsed state ──

  if (collapsed) {
    return (
      <div
        style={styles.collapsed}
        onClick={() => setCollapsed(false)}
      >
        <span style={styles.collapsedLabel}>ALERTS</span>
        {events.length > 0 && (
          <span style={styles.badge}>{events.length}</span>
        )}
        <span style={styles.collapsedArrow}>&#9654;</span>
      </div>
    );
  }

  // ── Expanded ──

  const currentFields = FIELD_OPTIONS[formLayer] ?? FIELD_OPTIONS.earthquakes;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Alert Rules</span>
        <button
          style={styles.closeBtn}
          onClick={() => setCollapsed(true)}
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(viewTab === 'rules' ? styles.tabActive : {}),
          }}
          onClick={() => setViewTab('rules')}
        >
          Rules ({rules.length})
        </button>
        <button
          style={{
            ...styles.tab,
            ...(viewTab === 'events' ? styles.tabActive : {}),
          }}
          onClick={() => setViewTab('events')}
        >
          Events
          {events.length > 0 && (
            <span style={{ ...styles.badge, marginLeft: 6 }}>
              {events.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {viewTab === 'rules' && (
          <>
            {rules.length === 0 && !showForm && (
              <div style={styles.empty}>No alert rules configured</div>
            )}

            {rules.map((rule) => (
              <div key={rule.id} style={styles.ruleItem}>
                <button
                  style={{
                    ...styles.toggle,
                    ...(rule.enabled ? styles.toggleOn : {}),
                  }}
                  onClick={() => toggleRule(rule.id, !rule.enabled)}
                  title={rule.enabled ? 'Disable' : 'Enable'}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: rule.enabled ? 16 : 2,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
                <div style={styles.ruleInfo}>
                  <div style={styles.ruleName}>{rule.name}</div>
                  <div style={styles.ruleMeta}>
                    {rule.layerId} &middot;{' '}
                    {rule.conditions
                      .map(
                        (c) =>
                          `${c.field} ${OPERATOR_LABELS[c.operator]} ${c.value}`,
                      )
                      .join(', ')}
                    {rule.location
                      ? ` · ${rule.location.radiusKm}km radius`
                      : ''}
                  </div>
                </div>
                <button
                  style={styles.deleteBtn}
                  onClick={() => deleteRule(rule.id)}
                  title="Delete rule"
                >
                  &#10005;
                </button>
              </div>
            ))}

            {!showForm && (
              <button style={styles.newBtn} onClick={() => setShowForm(true)}>
                + New Rule
              </button>
            )}

            {showForm && (
              <div style={styles.form}>
                {/* Rule name */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Rule Name</label>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="e.g. Major Earthquake"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                {/* Layer */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Layer</label>
                  <select
                    style={styles.select}
                    value={formLayer}
                    onChange={(e) => setFormLayer(e.target.value)}
                  >
                    {LAYER_OPTIONS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Condition */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Condition</label>
                  <div style={styles.conditionRow}>
                    <select
                      style={{ ...styles.select, flex: 1 }}
                      value={formField}
                      onChange={(e) => setFormField(e.target.value)}
                    >
                      {currentFields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      style={{ ...styles.select, width: 60, flex: 'none' }}
                      value={formOp}
                      onChange={(e) =>
                        setFormOp(e.target.value as AlertCondition['operator'])
                      }
                    >
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="eq">=</option>
                      <option value="contains">contains</option>
                    </select>
                    <input
                      style={{ ...styles.input, flex: 1 }}
                      type="text"
                      placeholder="value"
                      value={formValue}
                      onChange={(e) => setFormValue(e.target.value)}
                    />
                  </div>
                </div>

                {/* Location filter */}
                <div style={styles.formGroup}>
                  <label
                    style={{ ...styles.checkbox, marginBottom: 4 }}
                    onClick={() => setFormLocationEnabled(!formLocationEnabled)}
                  >
                    <input
                      type="checkbox"
                      checked={formLocationEnabled}
                      onChange={() =>
                        setFormLocationEnabled(!formLocationEnabled)
                      }
                      style={{ accentColor: '#00c8d2' }}
                    />
                    Location Filter
                  </label>
                  {formLocationEnabled && (
                    <div style={styles.locationRow}>
                      <input
                        style={{ ...styles.input, flex: 1 }}
                        type="text"
                        placeholder="Lat"
                        value={formLat}
                        onChange={(e) => setFormLat(e.target.value)}
                      />
                      <input
                        style={{ ...styles.input, flex: 1 }}
                        type="text"
                        placeholder="Lng"
                        value={formLng}
                        onChange={(e) => setFormLng(e.target.value)}
                      />
                      <input
                        style={{ ...styles.input, width: 60, flex: 'none' }}
                        type="text"
                        placeholder="km"
                        value={formRadius}
                        onChange={(e) => setFormRadius(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Notifications */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Notify Via</label>
                  <div style={styles.notifyRow}>
                    <label
                      style={styles.checkbox}
                      onClick={() => setFormNotifyWs(!formNotifyWs)}
                    >
                      <input
                        type="checkbox"
                        checked={formNotifyWs}
                        onChange={() => setFormNotifyWs(!formNotifyWs)}
                        style={{ accentColor: '#00c8d2' }}
                      />
                      WebSocket
                    </label>
                    <label
                      style={styles.checkbox}
                      onClick={() => setFormNotifyTg(!formNotifyTg)}
                    >
                      <input
                        type="checkbox"
                        checked={formNotifyTg}
                        onChange={() => setFormNotifyTg(!formNotifyTg)}
                        style={{ accentColor: '#00c8d2' }}
                      />
                      Telegram
                    </label>
                  </div>
                </div>

                {/* Cooldown */}
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Cooldown (minutes)</label>
                  <select
                    style={styles.select}
                    value={formCooldown}
                    onChange={(e) => setFormCooldown(Number(e.target.value))}
                  >
                    {COOLDOWN_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div style={styles.formActions}>
                  <button
                    style={styles.saveBtn}
                    onClick={createRule}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Create Rule'}
                  </button>
                  <button style={styles.cancelBtn} onClick={resetForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {viewTab === 'events' && (
          <>
            {events.length === 0 && (
              <div style={styles.empty}>No alerts triggered yet</div>
            )}
            {events.map((evt) => (
              <div key={evt.id} style={styles.eventItem}>
                <div style={styles.eventHeader}>
                  <span style={styles.eventRuleName}>{evt.ruleName}</span>
                  <span style={styles.eventTime}>{timeAgo(evt.timestamp)}</span>
                </div>
                <div style={styles.eventMessage}>{evt.message}</div>
                {evt.matchedFeatures.length > 0 && (
                  <div style={styles.eventFeatures}>
                    {evt.matchedFeatures
                      .slice(0, 3)
                      .map((f) => f.label)
                      .join(', ')}
                    {evt.matchedFeatures.length > 3 &&
                      ` +${evt.matchedFeatures.length - 3} more`}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default AlertRules;
