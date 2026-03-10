interface LayerInfo {
  visible: boolean;
  status: string;
  count: number;
  displayName: string;
}

interface LayerToggleProps {
  layers: Record<string, LayerInfo>;
  onToggle: (layerId: string) => void;
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

function LayerToggle({ layers, onToggle }: LayerToggleProps) {
  return (
    <div className="layer-toggle">
      <div className="layer-toggle__header">Layers</div>
      {Object.entries(layers).map(([id, info]) => (
        <label key={id} className="layer-toggle__item">
          <input
            type="checkbox"
            checked={info.visible}
            onChange={() => onToggle(id)}
            className="layer-toggle__checkbox"
          />
          <span
            className="layer-toggle__dot"
            style={{ backgroundColor: statusDotColor(info.status) }}
          />
          <span className="layer-toggle__name">{info.displayName}</span>
          <span className="layer-toggle__count">{info.count}</span>
        </label>
      ))}
    </div>
  );
}

export default LayerToggle;
