import { memo } from 'react';

interface Props {
  getViewer: () => any;
  coords?: { lat: number; lng: number } | null;
  connected?: boolean;
  eqCount?: number;
  wxCount?: number;
}

function CoordinateDisplay({ coords, connected, eqCount, wxCount }: Props) {
  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 10,
      background: 'rgba(0,0,0,0.7)', color: '#fff',
      padding: '8px 14px', borderRadius: 6, fontSize: 13,
      fontFamily: 'monospace', zIndex: 1000,
      display: 'flex', gap: 16, alignItems: 'center'
    }}>
      <span style={{ color: connected ? '#4ade80' : '#f87171' }}>
        {connected ? '● LIVE' : '○ OFFLINE'}
      </span>
      {coords && (
        <span>{coords.lat.toFixed(4)}°, {coords.lng.toFixed(4)}°</span>
      )}
      {(eqCount !== undefined) && <span>🔴 {eqCount} earthquakes</span>}
      {(wxCount !== undefined) && <span>⚡ {wxCount} weather alerts</span>}
    </div>
  );
}

export default memo(CoordinateDisplay);
