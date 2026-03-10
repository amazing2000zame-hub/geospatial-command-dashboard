import { useState } from 'react';
import { useLayerStore, LAYER_CONFIGS, type LayerConfig } from '../store/layerStore';

const GROUP_LABELS: Record<string, string> = {
  live: 'LIVE DATA',
  surveillance: 'SURVEILLANCE',
  space: 'SPACE',
};

const GROUP_ORDER = ['live', 'surveillance', 'space'];

function groupedConfigs(): Record<string, LayerConfig[]> {
  const groups: Record<string, LayerConfig[]> = {};
  for (const config of LAYER_CONFIGS) {
    if (!groups[config.group]) groups[config.group] = [];
    groups[config.group].push(config);
  }
  return groups;
}

function StatusDot({ status }: { status: string }) {
  let color = '#888';
  let pulse = false;
  switch (status) {
    case 'active': color = '#4caf50'; break;
    case 'loading': color = '#ffc107'; pulse = true; break;
    case 'error': color = '#ff2d2d'; break;
    case 'disabled': color = '#555'; break;
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
        animation: pulse ? 'pulse-dot 1.5s ease-in-out infinite' : undefined,
      }}
    />
  );
}

function ControlPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const layers = useLayerStore((s) => s.layers);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const groups = groupedConfigs();

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1100,
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: 14,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        aria-label="Open control panel"
      >
        <span style={{ marginRight: 6 }}>&#9776;</span>
        GSD
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 280,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 13,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#e0e0ff',
              textShadow: '0 0 20px rgba(100,140,255,0.3)',
            }}
          >
            GEOSPATIAL COMMAND
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2, letterSpacing: 1 }}>
            REAL-TIME MONITORING
          </div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 18,
            padding: '2px 4px',
            lineHeight: 1,
          }}
          aria-label="Collapse panel"
        >
          &#x2039;
        </button>
      </div>

      {/* Layer groups */}
      <div style={{ padding: '8px 0', flex: 1 }}>
        {GROUP_ORDER.map((groupKey) => {
          const configs = groups[groupKey];
          if (!configs) return null;
          return (
            <div key={groupKey} style={{ marginBottom: 4 }}>
              <div
                style={{
                  padding: '10px 16px 6px',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: '#666',
                }}
              >
                {GROUP_LABELS[groupKey]}
              </div>
              {configs.map((config) => {
                const layerState = layers[config.id];
                if (!layerState) return null;
                const isEnabled = layerState.enabled;
                const isVisible = layerState.visible;
                return (
                  <label
                    key={config.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 16px',
                      cursor: isEnabled ? 'pointer' : 'not-allowed',
                      opacity: isEnabled ? 1 : 0.4,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (isEnabled) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    {/* Toggle switch */}
                    <div
                      onClick={(e) => {
                        if (!isEnabled) return;
                        e.preventDefault();
                        toggleLayer(config.id);
                      }}
                      style={{
                        width: 32,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: isVisible && isEnabled ? config.color : 'rgba(255,255,255,0.15)',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                        cursor: isEnabled ? 'pointer' : 'not-allowed',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: isVisible && isEnabled ? 16 : 2,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          backgroundColor: '#fff',
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}
                      />
                    </div>

                    {/* Status dot */}
                    <StatusDot status={layerState.status} />

                    {/* Name */}
                    <span style={{ flex: 1, color: isEnabled ? '#ddd' : '#666' }}>
                      {config.displayName}
                    </span>

                    {/* Count badge */}
                    {isEnabled && layerState.count > 0 && (
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          padding: '1px 7px',
                          borderRadius: 10,
                          fontSize: 10,
                          color: '#aaa',
                          minWidth: 20,
                          textAlign: 'center',
                        }}
                      >
                        {layerState.count.toLocaleString()}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 10,
          color: '#555',
          textAlign: 'center',
        }}
      >
        Geospatial Dashboard v2.0
      </div>
    </div>
  );
}

export default ControlPanel;
