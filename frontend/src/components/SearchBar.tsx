import { useState, useCallback } from 'react';
import { Cartesian3, Viewer, IonGeocoderService, GeocoderService } from 'cesium';

interface SearchBarProps {
  getViewer: () => Viewer | null;
}

function SearchBar({ getViewer }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const viewer = getViewer();
    if (!viewer) return;

    // Check if input looks like coordinates (e.g., "36.2, -120.3")
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, 1000000),
        duration: 2,
      });
      setQuery('');
      return;
    }

    // Use Ion Geocoder for city names
    setLoading(true);
    try {
      const geocoder: GeocoderService = new IonGeocoderService({ scene: viewer.scene });
      const results = await geocoder.geocode(trimmed);
      if (results.length > 0) {
        const result = results[0];
        viewer.camera.flyTo({
          destination: result.destination,
          duration: 2,
        });
        setQuery('');
      }
    } catch (err) {
      console.warn('Geocode failed:', err);
    } finally {
      setLoading(false);
    }
  }, [query, getViewer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Searching...' : 'Search city or lat, lng...'}
        disabled={loading}
      />
    </div>
  );
}

export default SearchBar;
