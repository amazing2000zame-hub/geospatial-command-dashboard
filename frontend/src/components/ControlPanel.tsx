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

function ControlPanel() {
  const layers = useLayerStore((s) => s.layers);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);
  const groups = groupedConfigs();

  return (
    <div className="control-panel">
      <div className="control-panel__title">DATA LAYERS</div>

      {GROUP_ORDER.map((groupKey) => {
        const configs = groups[groupKey];
        if (!configs) return null;
        return (
          <div key={groupKey} className="control-panel__group">
            <div className="control-panel__group-label">
              {GROUP_LABELS[groupKey]}
            </div>
            {configs.map((config) => {
              const layerState = layers[config.id];
              if (!layerState) return null;
              const isEnabled = layerState.enabled;
              const isVisible = layerState.visible;
              const statusClass =
                layerState.status === 'active' ? 'layer-toggle__dot--active' :
                layerState.status === 'loading' ? 'layer-toggle__dot--loading' :
                layerState.status === 'error' ? 'layer-toggle__dot--error' : '';

              return (
                <div
                  key={config.id}
                  className="layer-toggle"
                  onClick={() => isEnabled && toggleLayer(config.id)}
                  style={{ opacity: isEnabled ? 1 : 0.4 }}
                >
                  <div className="layer-toggle__info">
                    <span className={`layer-toggle__dot ${statusClass}`} />
                    <span className={`layer-toggle__name ${isVisible ? 'layer-toggle__name--active' : ''}`}>
                      {config.displayName}
                    </span>
                    {isEnabled && layerState.count > 0 && (
                      <span className="layer-toggle__count">
                        {layerState.count.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <button
                    className={`layer-toggle__switch ${isVisible && isEnabled ? 'layer-toggle__switch--on' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default ControlPanel;
