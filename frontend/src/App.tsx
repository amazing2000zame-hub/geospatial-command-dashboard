import { useCallback } from 'react';
import Globe from './components/Globe';
import EarthquakeLayer from './components/EarthquakeLayer';
import WeatherLayer from './components/WeatherLayer';
import FlightLayer from './components/FlightLayer';
import ALPRLayer from './components/ALPRLayer';
import SpeedCameraLayer from './components/SpeedCameraLayer';
import SatelliteLayer from './components/SatelliteLayer';
import TrafficCameraLayer from './components/TrafficCameraLayer';
import HoverTooltip from './components/HoverTooltip';
import SearchBarBridge from "./components/SearchBarBridge";
import ZoomControls from "./components/ZoomControls";
import ControlPanel from './components/ControlPanel';
import StatusBar from './components/StatusBar';
import DetailPopup from './components/DetailPopup';
import ImageryToggle from './components/ImageryToggle';
import StreetView from './components/StreetView';
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
      <Globe>
        {/* Data layers: render as children inside the Viewer, return null */}
        <EarthquakeLayer />
        <WeatherLayer />
        <FlightLayer />
        <ALPRLayer />
        <SpeedCameraLayer />
        <TrafficCameraLayer />
        <SatelliteLayer />

        {/* Hover tooltip for all layers */}
        <HoverTooltip />

        {/* SearchBar needs viewer access via Globe context */}
        <SearchBarBridge />
        <ZoomControls />
      </Globe>

      {/* UI overlays positioned absolutely, outside the Viewer tree */}
      <ControlPanel />
      <StatusBar />
      <DetailPopup feature={selectedFeature} onClose={handleClosePopup} />
      <ImageryToggle />
      <StreetView />
    </>
  );
}

export default App;
