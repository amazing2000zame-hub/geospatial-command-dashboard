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
    default:
      return '#888';
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
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
  const callsign = (props.callsign as string)?.trim() || 'Unknown';
  const altitude = props.altitudeFt as number | undefined;
  const speed = props.speedKnots as number | undefined;
  const origin = props.originCountry as string | undefined;
  const onGround = props.onGround as boolean | undefined;
  const squawk = props.squawk as string | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{callsign}</h3>
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
      {squawk && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">Squawk</span>
          <span>{squawk}</span>
        </div>
      )}
    </>
  );
}

function SatelliteDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
  const name = props.label || props.OBJECT_NAME as string || 'Unknown';
  const noradId = props.NORAD_CAT_ID as number | undefined;
  const altitude = props.altitude_km as number | undefined;
  const inclination = props.INCLINATION as number | undefined;

  return (
    <>
      <h3 className="detail-popup__title">{name}</h3>
      {noradId && (
        <div className="detail-popup__row">
          <span className="detail-popup__label">NORAD ID</span>
          <span>{noradId}</span>
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
    </>
  );
}

function GenericDetail({ feature }: { feature: LayerFeature }) {
  const props = feature.properties;
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
          <span>{props.category}</span>
        </div>
      )}
    </>
  );
}

function DetailPopup({ feature, onClose }: DetailPopupProps) {
  if (!feature) return null;

  const layer = feature.properties.layer;
  const borderColor = layerBorderColor(layer);

  return (
    <div className="detail-popup" style={{ borderLeftColor: borderColor }}>
      <button className="detail-popup__close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      {layer === 'earthquakes' && <EarthquakeDetail feature={feature} />}
      {layer === 'weather' && <WeatherDetail feature={feature} />}
      {layer === 'flights' && <FlightDetail feature={feature} />}
      {layer === 'satellites' && <SatelliteDetail feature={feature} />}
      {!['earthquakes', 'weather', 'flights', 'satellites'].includes(layer) && (
        <GenericDetail feature={feature} />
      )}
    </div>
  );
}

export default DetailPopup;
