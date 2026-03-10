import { useState, useEffect, memo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useLayerStore, LAYER_CONFIGS } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';

function StatusBar() {
  const { connected } = useWebSocket();
  const coords = useUiStore((s) => s.coords);
  const layers = useLayerStore((s) => s.layers);
  const [utc, setUtc] = useState('');

  // Update UTC clock every second
  useEffect(() => {
    function tick() {
      const now = new Date();
      setUtc(
        now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      );
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Gather active layer counts
  const activeLayers = LAYER_CONFIGS.filter((c) => {
    const state = layers[c.id];
    return state && state.enabled && state.status !== 'disabled';
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 28,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.8)',
        color: '#ccc',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: 11,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        pointerEvents: 'none',
      }}
    >
      {/* Connection status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: connected ? '#4caf50' : '#ff2d2d',
            flexShrink: 0,
          }}
        />
        <span style={{ color: connected ? '#4caf50' : '#ff2d2d', fontWeight: 600, fontSize: 10, letterSpacing: 0.5 }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </span>

      {/* Divider */}
      <span style={{ color: '#333' }}>|</span>

      {/* Coordinates */}
      <span style={{ minWidth: 180 }}>
        {coords
          ? `${coords.lat >= 0 ? '+' : ''}${coords.lat.toFixed(4)}\u00B0  ${coords.lng >= 0 ? '+' : ''}${coords.lng.toFixed(4)}\u00B0`
          : '----.----\u00B0  ----.----\u00B0'}
      </span>

      {/* Divider */}
      <span style={{ color: '#333' }}>|</span>

      {/* Layer counts */}
      {activeLayers.map((config) => {
        const state = layers[config.id];
        return (
          <span key={config.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: state.status === 'active' ? config.color : state.status === 'loading' ? '#ffc107' : '#ff2d2d',
                flexShrink: 0,
              }}
            />
            <span style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.3 }}>
              {config.id.slice(0, 3)}
            </span>
            <span style={{ color: '#888' }}>{state.count}</span>
          </span>
        );
      })}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* UTC Clock */}
      <span style={{ color: '#777', fontSize: 10 }}>
        {utc}
      </span>
    </div>
  );
}

export default memo(StatusBar);
