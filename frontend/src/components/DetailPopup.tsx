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
    case 'active_fires':
      return '#ff6b35';
    case 'conflict_events':
      return '#ef4444';
    case 'crime_incidents':
      return '#a855f7';
    case 'dispatch':
      return '#38bdf8';
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
  const isMilitary = props.isMilitary as boolean | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{callsign}</h3>
      {isMilitary && (
        <span className="detail-popup__badge" style={{ backgroundColor: '#ef4444' }}>
          MILITARY
        </span>
      )}
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
  return (
    <>
      <h3 className="detail-popup__title">{name}</h3>
      <span className="detail-popup__badge" style={{ backgroundColor: '#22c55e' }}>
        LIVE FEED
      </span>

      {/* HLS video stream - auto-play when available */}
      {streamUrl && (
        <div className="detail-popup__camera-feed">
          <HlsPlayer url={streamUrl} />
        </div>
      )}
      {!streamUrl && (
        <div className="detail-popup__camera-error">
          No live stream available for this camera
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

function FireDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const brightness = props.brightness as number | undefined;
  const frp = props.frp as number | undefined;
  const confidence = props.confidence as number | undefined;
  const acqDate = props.acqDate as string | undefined;
  const acqTime = props.acqTime as string | undefined;
  const satellite = props.satellite as string | undefined;
  const daynight = props.daynight as string | undefined;

  return (
    <>
      <h3 className="detail-popup__title">Active Fire / Hotspot</h3>
      <span className="detail-popup__badge" style={{ backgroundColor: '#ff6b35' }}>
        {(frp ?? 0) > 50 ? 'HIGH INTENSITY' : 'DETECTED'}
      </span>
      {brightness !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Brightness</span>
          <span>{brightness.toFixed(1)} K</span>
        </div>
      )}
      {frp !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">FRP</span>
          <span>{frp.toFixed(1)} MW</span>
        </div>
      )}
      {confidence !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Confidence</span>
          <span>{confidence}%</span>
        </div>
      )}
      {acqDate && acqTime && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Acquired</span>
          <span>{acqDate} {acqTime}Z</span>
        </div>
      )}
      {satellite && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Satellite</span>
          <span>{satellite === 'T' ? 'Terra' : satellite === 'A' ? 'Aqua' : satellite}</span>
        </div>
      )}
      {daynight && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Time of Day</span>
          <span>{daynight === 'D' ? 'Daytime' : 'Nighttime'}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Position</span>
        <span>{formatCoords(coords)}</span>
      </div>
    </>
  );
}

function ConflictDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const eventType = props.eventType as string | undefined;
  const actor1 = props.actor1 as string | undefined;
  const actor2 = props.actor2 as string | undefined;
  const goldstein = props.goldstein as number | undefined;
  const geoName = props.geoName as string | undefined;
  const isMilitary = props.isMilitary as boolean | undefined;
  const numArticles = props.numArticles as number | undefined;
  const sourceUrl = props.sourceUrl as string | undefined;
  const eventDate = props.eventDate as string | undefined;

  const formattedDate = eventDate
    ? `${eventDate.slice(0, 4)}-${eventDate.slice(4, 6)}-${eventDate.slice(6, 8)}`
    : undefined;

  return (
    <>
      <h3 className="detail-popup__title">{eventType || 'Conflict Event'}</h3>
      <span
        className="detail-popup__badge"
        style={{ backgroundColor: isMilitary ? '#ef4444' : '#ff6b35' }}
      >
        {isMilitary ? 'MILITARY' : 'CONFLICT'}
      </span>
      {actor1 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Actor 1</span>
          <span>{actor1}</span>
        </div>
      )}
      {actor2 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Actor 2</span>
          <span>{actor2}</span>
        </div>
      )}
      {geoName && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Location</span>
          <span>{geoName}</span>
        </div>
      )}
      {goldstein !== undefined && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Goldstein</span>
          <span style={{ color: goldstein < -5 ? '#ff2a2a' : goldstein < 0 ? '#ffaa00' : '#34d399' }}>
            {goldstein.toFixed(1)}
          </span>
        </div>
      )}
      {formattedDate && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Date</span>
          <span>{formattedDate}</span>
        </div>
      )}
      {numArticles !== undefined && numArticles > 0 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Sources</span>
          <span>{numArticles} articles</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Position</span>
        <span>{formatCoords(coords)}</span>
      </div>
      {sourceUrl && (
        <a
          className="detail-popup__link"
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Source
        </a>
      )}
    </>
  );
}

function CrimeDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const offense = (props.offense as string) || props.label || 'Unknown Offense';
  const city = props.city as string | undefined;
  const address = props.address as string | undefined;
  const status = props.status as string | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{offense}</h3>
      <span className="detail-popup__badge" style={{ backgroundColor: '#a855f7' }}>
        CRIME
      </span>
      {city && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">City</span>
          <span>{city}</span>
        </div>
      )}
      {address && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Address</span>
          <span>{address}</span>
        </div>
      )}
      {status && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Status</span>
          <span>{status}</span>
        </div>
      )}
      {props.timestamp > 0 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Time</span>
          <span>{formatTimestamp(props.timestamp)}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Position</span>
        <span>{formatCoords(coords)}</span>
      </div>
    </>
  );
}

function DispatchDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const incidentType = props.label || 'Dispatch';
  const city = props.city as string | undefined;
  const address = props.address as string | undefined;
  const unit = props.unit as string | undefined;
  const status = props.status as string | undefined;
  const category = props.category as string | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{incidentType}</h3>
      <span
        className="detail-popup__badge"
        style={{ backgroundColor: category === 'fire' ? '#ff6b35' : '#38bdf8' }}
      >
        {category === 'fire' ? 'FIRE' : 'EMS'}
      </span>
      {city && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">City</span>
          <span>{city}</span>
        </div>
      )}
      {address && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Address</span>
          <span>{address}</span>
        </div>
      )}
      {unit && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Unit</span>
          <span>{unit}</span>
        </div>
      )}
      {status && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Status</span>
          <span>{status}</span>
        </div>
      )}
      {props.timestamp > 0 && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Time</span>
          <span>{formatTimestamp(props.timestamp)}</span>
        </div>
      )}
      <div className="detail-popup__row">
        <span className="detail-popup__label">Position</span>
        <span>{formatCoords(coords)}</span>
      </div>
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
  const isMilFlight = layer === 'flights' && feature.properties.isMilitary;
  const borderColor = isMilFlight ? '#ef4444' : layerBorderColor(layer);

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
    case 'active_fires':
      content = <FireDetail feature={feature} />;
      break;
    case 'conflict_events':
      content = <ConflictDetail feature={feature} />;
      break;
    case 'crime_incidents':
      content = <CrimeDetail feature={feature} />;
      break;
    case 'dispatch':
      content = <DispatchDetail feature={feature} />;
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
