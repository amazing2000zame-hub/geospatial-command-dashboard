import { useCallback } from 'react';
import Globe from './components/Globe';
import EarthquakeLayer from './components/EarthquakeLayer';
import WeatherLayer from './components/WeatherLayer';
import SearchBarBridge from './components/SearchBarBridge';
import ZoomControls from './components/ZoomControls';
import ControlPanel from './components/ControlPanel';
import StatusBar from './components/StatusBar';
import DetailPopup from './components/DetailPopup';
import HudOverlay from './components/HudOverlay';
import ModeSelector from './components/ModeSelector';
import { useUiStore } from './store/uiStore';
import './App.css';

function App() {
  const selectedFeature = useUiStore((s) => s.selectedFeature);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const handleClosePopup = useCallback(() => {
    selectFeature(null);
  }, [selectFeature]);

  return (
    <>
      {/* Military HUD overlays */}
      <HudOverlay />

      <Globe>
        <EarthquakeLayer />
        <WeatherLayer />
        <SearchBarBridge />
        <ZoomControls />
      </Globe>

      {/* UI overlays */}
      <ControlPanel />
      <StatusBar />
      <ModeSelector />
      <DetailPopup feature={selectedFeature} onClose={handleClosePopup} />
    </>
  );
}

export default App;
