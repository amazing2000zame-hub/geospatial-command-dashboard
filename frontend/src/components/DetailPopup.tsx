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
      {layer !== 'earthquakes' && layer !== 'weather' && (
        <GenericDetail feature={feature} />
      )}
    </div>
  );
}

export default DetailPopup;
