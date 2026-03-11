import { useCallback } from 'react';
import Globe from './components/Globe';
import EarthquakeLayer from './components/EarthquakeLayer';
import WeatherLayer from './components/WeatherLayer';
import FlightLayer from './components/FlightLayer';
import ALPRLayer from './components/ALPRLayer';
import SpeedCameraLayer from './components/SpeedCameraLayer';
import SatelliteLayer from './components/SatelliteLayer';
import TrafficCameraLayer from './components/TrafficCameraLayer';
import FireLayer from './components/FireLayer';
import ConflictLayer from './components/ConflictLayer';
import CrimeLayer from './components/CrimeLayer';
import DispatchLayer from './components/DispatchLayer';
import VesselLayer from './components/VesselLayer';
import CyberThreatLayer from './components/CyberThreatLayer';
import SubmarineCableLayer from './components/SubmarineCableLayer';
import NuclearLayer from './components/NuclearLayer';
import PowerGridLayer from './components/PowerGridLayer';
import HomeCameraLayer from './components/HomeCameraLayer';
import HoverTooltip from './components/HoverTooltip';
import SearchBarBridge from './components/SearchBarBridge';
import ZoomControls from './components/ZoomControls';
import ControlPanel from './components/ControlPanel';
import StatusBar from './components/StatusBar';
import DetailPopup from './components/DetailPopup';
import HudOverlay from './components/HudOverlay';
import ModeSelector from './components/ModeSelector';
import StreetView from './components/StreetView';
import IntelPanel from './components/IntelPanel';
import TimeRangeFilter from './components/TimeRangeFilter';
import AlertRules from './components/AlertRules';
import HistoricalPlayback from './components/HistoricalPlayback';
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

      <Globe
        overlays={
          <>
            <SearchBarBridge />
            <ZoomControls />
          </>
        }
      >
        {/* Data layers */}
        <EarthquakeLayer />
        <WeatherLayer />
        <FlightLayer />
        <ALPRLayer />
        <SpeedCameraLayer />
        <SatelliteLayer />
        <TrafficCameraLayer />
        <FireLayer />
        <ConflictLayer />
        <CrimeLayer />
        <DispatchLayer />
        <VesselLayer />
        <CyberThreatLayer />
        <SubmarineCableLayer />
        <NuclearLayer />
        <PowerGridLayer />
        <HomeCameraLayer />

        {/* Hover tooltip for all layers */}
        <HoverTooltip />
      </Globe>

      {/* UI overlays */}
      <ControlPanel />
      <StatusBar />
      <ModeSelector />
      <DetailPopup feature={selectedFeature} onClose={handleClosePopup} />
      <StreetView />
      <IntelPanel />
      <TimeRangeFilter />
      <AlertRules />
      <HistoricalPlayback />
    </>
  );
}

export default App;
