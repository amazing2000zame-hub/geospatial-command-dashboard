import { useEffect, useState } from 'react';
import Globe from './components/Globe';
import SearchBar from './components/SearchBar';
import CoordinateDisplay from './components/CoordinateDisplay';
import { useWebSocket } from './hooks/useWebSocket';
import type { EarthquakeData, WeatherData } from './types';

function App() {
  const [earthquakes, setEarthquakes] = useState<EarthquakeData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [searchTarget, setSearchTarget] = useState<string | null>(null);

  const { connected } = useWebSocket({
    onMessage: (data) => {
      if (data.type === 'initial') {
        setEarthquakes(data.data.earthquakes);
        setWeather(data.data.weather);
      } else if (data.type === 'earthquakes') {
        setEarthquakes(data.data);
      } else if (data.type === 'weather') {
        setWeather(data.data);
      }
    },
  });

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Globe
        earthquakes={earthquakes}
        weather={weather}
        onMouseMove={setCoordinates}
        searchTarget={searchTarget}
        onSearchComplete={() => setSearchTarget(null)}
      />
      <SearchBar onSearch={setSearchTarget} />
      <CoordinateDisplay coordinates={coordinates} connected={connected} />
    </div>
  );
}

export default App;
