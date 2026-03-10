interface StatusBarProps {
  connected: boolean;
  layers: Record<string, { count: number; status: string }>;
}

function statusDotColor(status: string): string {
  switch (status) {
    case 'active':
    case 'ok':
      return '#4caf50';
    case 'loading':
    case 'pending':
      return '#ffc107';
    case 'error':
      return '#ff2d2d';
    default:
      return '#888';
  }
}

function StatusBar({ connected, layers }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span className="status-bar__item">
        <span
          className="status-bar__dot"
          style={{ backgroundColor: connected ? '#4caf50' : '#ff2d2d' }}
        />
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      {Object.entries(layers).map(([name, info]) => (
        <span key={name} className="status-bar__item">
          <span
            className="status-bar__dot"
            style={{ backgroundColor: statusDotColor(info.status) }}
          />
          {name}: {info.count}
        </span>
      ))}
    </div>
  );
}

export default StatusBar;
