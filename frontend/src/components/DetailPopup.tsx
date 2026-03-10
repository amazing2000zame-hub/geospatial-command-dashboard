import { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { LayerFeature } from '../types/geojson';

interface DetailPopupProps {
  feature: LayerFeature | null;
  onClose: () => void;
}

function formatTimestamp(unix: number): string {
  const date = new Date(unix * 1000);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'extreme':
      return '#ff2d2d';
    case 'severe':
      return '#ff6b35';
    case 'moderate':
      return '#ffc107';
    case 'minor':
      return '#4da6ff';
    default:
      return '#888';
  }
}

function layerBorderColor(layer: string): string {
  switch (layer) {
    case 'earthquakes':
      return '#ff6b35';
    case 'weather':
      return '#4da6ff';
    case 'flights':
      return '#a78bfa';
    case 'alpr':
      return '#f472b6';
    case 'speed_cameras':
      return '#fb923c';
    case 'satellites':
      return '#34d399';
    case 'traffic_cameras':
      return '#22c55e';
    default:
      return '#888';
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

function formatCoords(coords: number[]): string {
  const lon = coords[0]?.toFixed(4) ?? '?';
  const lat = coords[1]?.toFixed(4) ?? '?';
  return `${lat}, ${lon}`;
}

function EarthquakeDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const depth = coords.length >= 3 ? coords[2] : null;
  const mag = (props.mag as number) ?? '?';
  const place = (props.place as string) ?? 'Unknown location';
  const url = props.url as string | undefined;

  return (
    <>
      <h3 className="detail-popup__title">M{mag} Earthquake</h3>
      <div className="detail-popup__row">
        <span className="detail-popup__label">Location</span>
        <span>{place}</span>
      </div>
      {depth !== null && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Depth</span>
          <span>{depth.toFixed(1)} km</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Coords</span>
        <span>{formatCoords(coords)}</span>
      </div>
      {props.timestamp > 0 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Time</span>
          <span>{formatTimestamp(props.timestamp)}</span>
        </div>
      )}
      {url && (
        <a
          className="detail-popup__link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on USGS
        </a>
      )}
    </>
  );
}

function WeatherDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const event = (props.event as string) ?? props.label;
  const severity = props.severity ?? '';
  const areaDesc = props.areaDesc as string | undefined;
  const headline = props.headline as string | undefined;
  const description = props.description as string | undefined;
  const effective = props.effective as number | undefined;
  const expires = props.expires as number | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{event}</h3>
      {severity && (
        <span
          className="detail-popup__badge"
          style={{ backgroundColor: severityColor(String(severity)) }}
        >
          {String(severity).toUpperCase()}
        </span>
      )}
      {areaDesc && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Area</span>
          <span>{areaDesc}</span>
        </div>
      )}
      {headline && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Headline</span>
          <span>{headline}</span>
        </div>
      )}
      {description && (
        <p className="detail-popup__description">
          {truncate(String(description), 300)}
        </p>
      )}
      {effective && expires && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Period</span>
          <span>
            {formatTimestamp(effective)} &rarr; {formatTimestamp(expires)}
          </span>
        </div>
      )}
    </>
  );
}

function FlightDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const callsign = (props.callsign as string)?.trim() || 'Unknown';
  const icao24 = props.icao24 as string | undefined;
  const altitude = props.altitudeFt as number | undefined;
  const speed = props.speedKnots as number | undefined;
  const origin = props.originCountry as string | undefined;
  const onGround = props.onGround as boolean | undefined;
  const squawk = props.squawk as string | undefined;
  const heading = props.trueTrack as number | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{callsign}</h3>
      {icao24 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">ICAO24</span>
          <span style={{ fontFamily: 'monospace' }}>{icao24}</span>
        </div>
      )}
      {origin && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Origin</span>
          <span>{origin}</span>
        </div>
      )}
      {altitude !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Altitude</span>
          <span>{onGround ? 'On Ground' : `${Math.round(altitude).toLocaleString()} ft`}</span>
        </div>
      )}
      {speed !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Speed</span>
          <span>{Math.round(speed)} kts</span>
        </div>
      )}
      {heading !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Heading</span>
          <span>{Math.round(heading)}&deg;</span>
        </div>
      )}
      {squawk && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Squawk</span>
          <span style={{ fontFamily: 'monospace', color: squawk === '7700' || squawk === '7600' || squawk === '7500' ? '#ff2d2d' : 'inherit' }}>{squawk}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Position</span>
        <span>{formatCoords(coords)}</span>
      </div>
    </>
  );
}

function SatelliteDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const name = props.label || props.OBJECT_NAME as string || 'Unknown';
  const noradId = props.NORAD_CAT_ID as number | undefined;
  const altitude = props.altitude_km as number | undefined;
  const inclination = props.INCLINATION as number | undefined;
  const period = props.PERIOD as number | undefined;
  const objectType = props.OBJECT_TYPE as string | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{name}</h3>
      {noradId && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">NORAD ID</span>
          <span style={{ fontFamily: 'monospace' }}>{noradId}</span>
        </div>
      )}
      {objectType && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Type</span>
          <span>{objectType}</span>
        </div>
      )}
      {altitude !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Altitude</span>
          <span>{Math.round(altitude)} km</span>
        </div>
      )}
      {inclination !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Inclination</span>
          <span>{inclination.toFixed(1)}&deg;</span>
        </div>
      )}
      {period !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Period</span>
          <span>{period.toFixed(1)} min</span>
        </div>
      )}
    </>
  );
}

function ALPRDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const operator = props.operator as string | undefined;
  const network = props.network as string | undefined;
  const description = props.description as string | undefined;
  const osmId = props.osmId as number | undefined;

  return (
    <>
      <h3 className="detail-popup__title">ALPR Camera</h3>
      <span className="detail-popup__badge" style={{ backgroundColor: '#dc2626' }}>
        SURVEILLANCE
      </span>
      {operator && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Operator</span>
          <span>{operator}</span>
        </div>
      )}
      {network && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Network</span>
          <span>{network}</span>
        </div>
      )}
      {description && (
        <p className="detail-popup__description">{description}</p>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Location</span>
        <span>{formatCoords(coords)}</span>
      </div>
      {osmId && (
        <a
          className="detail-popup__link"
          href={`https://www.openstreetmap.org/node/${osmId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on OpenStreetMap
        </a>
      )}
    </>
  );
}

function SpeedCameraDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const maxspeed = props.maxspeed as string | undefined;
  const direction = props.direction as string | undefined;
  const ref = props.ref as string | undefined;
  const osmId = props.osmId as number | undefined;

  return (
    <>
      <h3 className="detail-popup__title">
        {maxspeed ? `Speed Camera (${maxspeed})` : 'Speed Camera'}
      </h3>
      <span className="detail-popup__badge" style={{ backgroundColor: '#f59e0b' }}>
        ENFORCEMENT
      </span>
      {maxspeed && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Limit</span>
          <span>{maxspeed}</span>
        </div>
      )}
      {direction && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Direction</span>
          <span>{direction}</span>
        </div>
      )}
      {ref && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Ref</span>
          <span>{ref}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Location</span>
        <span>{formatCoords(coords)}</span>
      </div>
      {osmId && (
        <a
          className="detail-popup__link"
          href={`https://www.openstreetmap.org/node/${osmId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on OpenStreetMap
        </a>
      )}
    </>
  );
}

function HlsPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (url.endsWith('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 15,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError(true);
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = url;
      video.play().catch(() => {});
    } else {
      // Try as plain video
      video.src = url;
      video.play().catch(() => {});
    }
  }, [url]);

  if (error) {
    return <div className="detail-popup__camera-error">Stream unavailable</div>;
  }

  return (
    <video
      ref={videoRef}
      className="detail-popup__camera-img"
      muted
      autoPlay
      playsInline
      controls
      style={{ background: '#000' }}
    />
  );
}

function TrafficCameraDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const name = (props.label as string) || 'Traffic Camera';
  const streamUrl = props.streamUrl as string | undefined;
  const route = props.route as string | undefined;
  const direction = props.direction as string | undefined;
  const pageUrl = props.pageUrl as string | undefined;
  const [showStream, setShowStream] = useState(false);

  return (
    <>
      <h3 className="detail-popup__title">{name}</h3>
      <span className="detail-popup__badge" style={{ backgroundColor: '#22c55e' }}>
        LIVE FEED
      </span>

      {/* HLS video stream */}
      {showStream && streamUrl && (
        <div className="detail-popup__camera-feed">
          <HlsPlayer url={streamUrl} />
        </div>
      )}
      {!showStream && streamUrl && (
        <button
          className="detail-popup__stream-btn"
          onClick={() => setShowStream(true)}
        >
          Watch Live Feed
        </button>
      )}
      {!streamUrl && (
        <div className="detail-popup__camera-error">
          No live stream available
        </div>
      )}

      {route && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Route</span>
          <span>{route}</span>
        </div>
      )}
      {direction && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Direction</span>
          <span>{direction}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Location</span>
        <span>{formatCoords(coords)}</span>
      </div>
      {pageUrl && (
        <a
          className="detail-popup__link"
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on 511NY
        </a>
      )}
    </>
  );
}

function GenericDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  return (
    <>
      <h3 className="detail-popup__title">{props.label}</h3>
      <div className="detail-popup__row">
        <span className="detail-popup__label">Layer</span>
        <span>{props.layer}</span>
      </div>
      {props.category && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Category</span>
          <span>{String(props.category)}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Location</span>
        <span>{formatCoords(coords)}</span>
      </div>
    </>
  );
}

function DetailPopup({ feature, onClose }: DetailPopupProps) {
  if (!feature) return null;

  const layer = feature.properties.layer;
  const borderColor = layerBorderColor(layer);

  let content;
  switch (layer) {
    case 'earthquakes':
      content = <EarthquakeDetail feature={feature} />;
      break;
    case 'weather':
      content = <WeatherDetail feature={feature} />;
      break;
    case 'flights':
      content = <FlightDetail feature={feature} />;
      break;
    case 'satellites':
      content = <SatelliteDetail feature={feature} />;
      break;
    case 'alpr':
      content = <ALPRDetail feature={feature} />;
      break;
    case 'speed_cameras':
      content = <SpeedCameraDetail feature={feature} />;
      break;
    case 'traffic_cameras':
      content = <TrafficCameraDetail feature={feature} />;
      break;
    default:
      content = <GenericDetail feature={feature} />;
  }

  return (
    <div className="detail-popup" style={{ borderLeftColor: borderColor }}>
      <button className="detail-popup__close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      {content}
    </div>
  );
}

export default DetailPopup;
