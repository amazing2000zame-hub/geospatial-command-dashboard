interface CoordinateDisplayProps {
  coordinates: { lat: number; lng: number } | null;
  connected: boolean;
}

function CoordinateDisplay({ coordinates, connected }: CoordinateDisplayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 1000,
        minWidth: '300px',
      }}
    >
      <div style={{ marginBottom: '8px' }}>
        <strong>Status:</strong>{' '}
        <span style={{ color: connected ? '#4ade80' : '#f87171' }}>
          {connected ? '● Connected' : '● Disconnected'}
        </span>
      </div>
      {coordinates && (
        <div>
          <strong>Coordinates:</strong> {coordinates.lat.toFixed(4)}°,{' '}
          {coordinates.lng.toFixed(4)}°
        </div>
      )}
    </div>
  );
}

export default CoordinateDisplay;
