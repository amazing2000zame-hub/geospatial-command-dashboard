import { useState, useCallback } from 'react';
import { Cartesian3, Viewer, Rectangle } from 'cesium';

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

    // Check coordinates first
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, 500000),
        duration: 2,
      });
      setQuery('');
      return;
    }

    // Use Nominatim for geocoding (free, no API key)
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'GeospatialDashboard/1.0' } }
      );
      const results = await res.json();
      if (results.length > 0) {
        const { lat, lon, boundingbox } = results[0];
        if (boundingbox) {
          viewer.camera.flyTo({
            destination: Rectangle.fromDegrees(
              parseFloat(boundingbox[2]), parseFloat(boundingbox[0]),
              parseFloat(boundingbox[3]), parseFloat(boundingbox[1])
            ),
            duration: 2,
          });
        } else {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(parseFloat(lon), parseFloat(lat), 500000),
            duration: 2,
          });
        }
        setQuery('');
      }
    } catch (err) {
      console.warn('Geocode failed:', err);
    } finally {
      setLoading(false);
    }
  }, [query, getViewer]);

  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        placeholder={loading ? 'Searching...' : '🔍 Search city or lat, lng...'}
        disabled={loading}
      />
    </div>
  );
}

export default SearchBar;
