import { memo, useState, useEffect } from 'react';
import { LAYER_CONFIGS } from '../store/layerStore';

const LAYER_COUNT = LAYER_CONFIGS.length;

function HudOverlay() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const ts = time.toISOString().replace('T', ' ').substring(0, 23);

  return (
    <>
      {/* Scanlines */}
      <div className="scanlines" />
      {/* Vignette */}
      <div className="vignette" />
      {/* Frame border */}
      <div className="dashboard-frame" />
      {/* HUD corner brackets */}
      <div className="hud-corners" />
      <div className="hud-corners-bottom" />

      {/* Top-Left: Branding */}
      <div className="hud-header">
        <div className="hud-header__title">WORLDVIEW</div>
        <div className="hud-header__subtitle">GEOSPATIAL COMMAND DASHBOARD v2.0</div>
        <div className="hud-header__classified">
          HOMELAB OPS // HOMECLUSTER<br />
          REAL-TIME INTEL FEED<br />
          {LAYER_COUNT} ACTIVE LAYERS
        </div>
      </div>

      {/* Top-Right: REC indicator */}
      <div className="hud-rec">
        <div style={{ marginBottom: 4 }}>
          <span className="hud-rec__dot" />
          <span className="hud-rec__text">REC {ts}</span>
        </div>
        <div className="hud-rec__text">SYS: NOMINAL</div>
      </div>
    </>
  );
}

export default memo(HudOverlay);
