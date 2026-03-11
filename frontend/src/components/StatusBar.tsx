import { memo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useLayerStore, LAYER_CONFIGS } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';

function StatusBar() {
  const { connected } = useWebSocket();
  const coords = useUiStore((s) => s.coords);
  const layers = useLayerStore((s) => s.layers);

  const activeLayers = LAYER_CONFIGS.filter((c) => {
    const state = layers[c.id];
    return state && state.enabled && state.status !== 'disabled';
  });

  return (
    <div className="status-bar">
      <span className="status-bar__item">
        <span className={`status-bar__live-dot ${!connected ? 'status-bar__live-dot--offline' : ''}`} />
        {connected ? 'CONNECTED' : 'OFFLINE'}
      </span>

      {coords && (
        <span className="status-bar__item">
          {coords.lat >= 0 ? '+' : ''}{coords.lat.toFixed(4)}&deg;
          {' '}
          {coords.lng >= 0 ? '+' : ''}{coords.lng.toFixed(4)}&deg;
        </span>
      )}

      {activeLayers.map((config) => {
        const state = layers[config.id];
        const isError = state.status === 'error';
        const abbrev = config.id === 'conflict_events' ? 'CON'
          : config.id === 'active_fires' ? 'FIR'
          : config.id === 'traffic_cameras' ? 'CAM'
          : config.id === 'speed_cameras' ? 'SPD'
          : config.id === 'crime_incidents' ? 'CRM'
          : config.id === 'dispatch' ? 'DSP'
          : config.id.slice(0, 3).toUpperCase();
        return (
          <span key={config.id} className="status-bar__item" title={isError ? (state.error || 'Error') : config.displayName}>
            <span
              className="status-bar__live-dot"
              style={{
                background: state.status === 'active' ? config.color :
                  state.status === 'loading' ? 'var(--warning)' : 'var(--danger)',
                boxShadow: state.status === 'active'
                  ? `0 0 6px ${config.color}40`
                  : undefined,
              }}
            />
            {abbrev} {isError ? 'ERR' : state.count.toLocaleString()}
          </span>
        );
      })}
    </div>
  );
}

export default memo(StatusBar);
