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
    case 'vessels':
      return '#06b6d4';
    case 'cyber_threats':
      return '#a855f7';
    case 'submarine_cables':
      return '#00ffff';
    case 'nuclear_facilities':
      return '#84cc16';
    case 'power_grid':
      return '#fbbf24';
    case 'home_cameras':
      return '#00ffc8';
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

function VesselDetail({ feature }: { feature: LayerFeature }) {
  const p = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const shipTypes: Record<string, string> = {
    cargo: 'Cargo', tanker: 'Tanker', passenger: 'Passenger', military: 'Military',
    fishing: 'Fishing', utility: 'Utility', pleasure: 'Pleasure', other: 'Other',
  };
  const typeColors: Record<string, string> = {
    cargo: '#22c55e', tanker: '#f59e0b', passenger: '#3b82f6', military: '#ef4444',
    fishing: '#06b6d4', utility: '#a78bfa', pleasure: '#f472b6', other: '#6b7280',
  };
  const cat = String(p.category || 'other');
  return (
    <>
      <h3 className="detail-popup__title" style={{ color: typeColors[cat] || '#06b6d4' }}>
        {String(p.vesselName || p.label)}
      </h3>
      <div className="detail-popup__row"><span className="detail-popup__label">Type</span><span>{shipTypes[cat] || cat}</span></div>
      {p.mmsi && <div className="detail-popup__row"><span className="detail-popup__label">MMSI</span><span>{String(p.mmsi)}</span></div>}
      {p.imo && <div className="detail-popup__row"><span className="detail-popup__label">IMO</span><span>{String(p.imo)}</span></div>}
      {p.callSign && <div className="detail-popup__row"><span className="detail-popup__label">Call Sign</span><span>{String(p.callSign)}</span></div>}
      {p.destination && <div className="detail-popup__row"><span className="detail-popup__label">Destination</span><span>{String(p.destination)}</span></div>}
      {p.sog !== undefined && <div className="detail-popup__row"><span className="detail-popup__label">Speed</span><span>{Number(p.sog).toFixed(1)} kn</span></div>}
      {p.heading !== undefined && <div className="detail-popup__row"><span className="detail-popup__label">Heading</span><span>{String(p.heading)}&deg;</span></div>}
      <div className="detail-popup__row"><span className="detail-popup__label">Position</span><span>{formatCoords(coords)}</span></div>
    </>
  );
}

function CyberThreatDetail({ feature }: { feature: LayerFeature }) {
  const p = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const typeColors: Record<string, string> = { ddos: '#ef4444', scanning: '#f97316', malware: '#a855f7', probe: '#6b7280' };
  const cat = String(p.attackType || p.category || 'probe');
  return (
    <>
      <h3 className="detail-popup__title" style={{ color: typeColors[cat] || '#a855f7' }}>Cyber Threat: {cat.toUpperCase()}</h3>
      {p.ip && <div className="detail-popup__row"><span className="detail-popup__label">IP</span><span style={{ fontFamily: 'monospace' }}>{String(p.ip)}</span></div>}
      {p.country && <div className="detail-popup__row"><span className="detail-popup__label">Country</span><span>{String(p.country)}</span></div>}
      {p.city && <div className="detail-popup__row"><span className="detail-popup__label">City</span><span>{String(p.city)}</span></div>}
      {p.isp && <div className="detail-popup__row"><span className="detail-popup__label">ISP</span><span>{truncate(String(p.isp), 30)}</span></div>}
      {p.reports && <div className="detail-popup__row"><span className="detail-popup__label">Reports</span><span>{Number(p.reports).toLocaleString()}</span></div>}
      {p.targets && <div className="detail-popup__row"><span className="detail-popup__label">Targets</span><span>{Number(p.targets).toLocaleString()}</span></div>}
      <div className="detail-popup__row"><span className="detail-popup__label">Position</span><span>{formatCoords(coords)}</span></div>
    </>
  );
}

function SubmarineCableDetail({ feature }: { feature: LayerFeature }) {
  const p = feature.properties;
  return (
    <>
      <h3 className="detail-popup__title" style={{ color: String(p.cableColor || '#00ffff') }}>{String(p.cableName || p.label)}</h3>
      <div className="detail-popup__row"><span className="detail-popup__label">Type</span><span>Submarine Cable</span></div>
      <div className="detail-popup__row"><span className="detail-popup__label">ID</span><span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{String(p.id)}</span></div>
    </>
  );
}

function NuclearDetail({ feature }: { feature: LayerFeature }) {
  const p = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const statusColors: Record<string, string> = { operating: '#22c55e', shutdown: '#6b7280', under_construction: '#f59e0b', decommissioning: '#ef4444' };
  const status = String(p.status || p.category || 'operating');
  return (
    <>
      <h3 className="detail-popup__title" style={{ color: statusColors[status] || '#84cc16' }}>&#9762; {String(p.plantName || p.label)}</h3>
      <div className="detail-popup__row"><span className="detail-popup__label">Country</span><span>{String(p.country || '')}</span></div>
      <div className="detail-popup__row"><span className="detail-popup__label">Status</span><span style={{ color: statusColors[status] }}>{status.replace(/_/g, ' ').toUpperCase()}</span></div>
      {p.reactorCount && <div className="detail-popup__row"><span className="detail-popup__label">Reactors</span><span>{String(p.reactorCount)}</span></div>}
      {p.reactorType && <div className="detail-popup__row"><span className="detail-popup__label">Type</span><span>{String(p.reactorType)}</span></div>}
      {p.capacity_mw && <div className="detail-popup__row"><span className="detail-popup__label">Capacity</span><span>{Number(p.capacity_mw).toLocaleString()} MW</span></div>}
      <div className="detail-popup__row"><span className="detail-popup__label">Position</span><span>{formatCoords(coords)}</span></div>
    </>
  );
}

function PowerGridDetail({ feature }: { feature: LayerFeature }) {
  const p = feature.properties;
  const coords = feature.geometry.coordinates as number[];
  const kind = String(p.featureKind || 'infrastructure');

  if (kind === 'outage') {
    return (
      <>
        <h3 className="detail-popup__title" style={{ color: '#ef4444' }}>&#9889; Power Outage - {String(p.state)}</h3>
        <div className="detail-popup__row"><span className="detail-popup__label">Customers Out</span><span>{Number(p.customersOut).toLocaleString()}</span></div>
        <div className="detail-popup__row"><span className="detail-popup__label">Total Tracked</span><span>{Number(p.customersTotal).toLocaleString()}</span></div>
        <div className="detail-popup__row"><span className="detail-popup__label">Percent Out</span><span style={{ color: '#ef4444' }}>{Number(p.percentOut).toFixed(2)}%</span></div>
      </>
    );
  }
  return (
    <>
      <h3 className="detail-popup__title" style={{ color: String(p.typeColor || '#fbbf24') }}>{String(p.label)}</h3>
      <div className="detail-popup__row"><span className="detail-popup__label">Type</span><span>{String(p.plantType || '').toUpperCase()}</span></div>
      <div className="detail-popup__row"><span className="detail-popup__label">State</span><span>{String(p.state || '')}</span></div>
      {p.capacity_mw && <div className="detail-popup__row"><span className="detail-popup__label">Capacity</span><span>{Number(p.capacity_mw).toLocaleString()} MW</span></div>}
      <div className="detail-popup__row"><span className="detail-popup__label">Position</span><span>{formatCoords(coords)}</span></div>
    </>
  );
}

function HomeCameraDetail({ feature }: { feature: LayerFeature }) {
  const p = feature.properties;
  const cat = String(p.category || 'camera');

  if (cat === 'alpr_detection') {
    return (
      <>
        <h3 className="detail-popup__title" style={{ color: '#fbbf24' }}>License Plate Detection</h3>
        <div className="detail-popup__row"><span className="detail-popup__label">Plate</span><span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{String(p.plate)}</span></div>
        {p.confidence && <div className="detail-popup__row"><span className="detail-popup__label">Confidence</span><span>{(Number(p.confidence) * 100).toFixed(1)}%</span></div>}
        {p.vehicleType && <div className="detail-popup__row"><span className="detail-popup__label">Vehicle</span><span>{String(p.vehicleType)}</span></div>}
        {p.vehicleColor && <div className="detail-popup__row"><span className="detail-popup__label">Color</span><span>{String(p.vehicleColor)}</span></div>}
      </>
    );
  }

  return (
    <>
      <h3 className="detail-popup__title" style={{ color: '#00ffc8' }}>{String(p.label)}</h3>
      <div className="detail-popup__row"><span className="detail-popup__label">Status</span><span style={{ color: p.haAvailable ? '#22c55e' : '#ef4444' }}>{p.haAvailable ? 'ONLINE' : 'OFFLINE'}</span></div>
      <div className="detail-popup__row"><span className="detail-popup__label">Entity</span><span style={{ fontSize: '10px', fontFamily: 'monospace' }}>{String(p.entityId || '')}</span></div>
      {p.snapshotUrl && (
        <div style={{ marginTop: '8px' }}>
          <img src={String(p.snapshotUrl)} alt="Camera" style={{ width: '100%', borderRadius: '4px', border: '1px solid rgba(0,255,200,0.3)' }} />
        </div>
      )}
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
    case 'vessels':
      content = <VesselDetail feature={feature} />;
      break;
    case 'cyber_threats':
      content = <CyberThreatDetail feature={feature} />;
      break;
    case 'submarine_cables':
      content = <SubmarineCableDetail feature={feature} />;
      break;
    case 'nuclear_facilities':
      content = <NuclearDetail feature={feature} />;
      break;
    case 'power_grid':
      content = <PowerGridDetail feature={feature} />;
      break;
    case 'home_cameras':
      content = <HomeCameraDetail feature={feature} />;
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
