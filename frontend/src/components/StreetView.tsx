import { useUiStore } from '../store/uiStore';

function StreetView() {
  const coords = useUiStore((s) => s.streetViewCoords);
  const close = useUiStore((s) => s.closeStreetView);

  if (!coords) return null;

  // Use Google Street View embed (free, no API key for embed URL)
  const url = `https://www.google.com/maps/embed?pb=!4v0!6m8!1m7!1s!2m2!1d${coords.lat}!2d${coords.lng}!3f0!4f0!5f0.7820865974627469`;

  // Mapillary street-level view (truly free, open source)
  const mapillaryUrl = `https://www.mapillary.com/app/?lat=${coords.lat}&lng=${coords.lng}&z=17`;

  return (
    <div className="street-view-panel">
      <div className="street-view-panel__header">
        <span className="street-view-panel__title">
          Street View ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
        </span>
        <button className="street-view-panel__close" onClick={close}>
          &times;
        </button>
      </div>
      <div className="street-view-panel__content">
        <iframe
          src={`https://www.google.com/maps?q=&layer=c&cbll=${coords.lat},${coords.lng}&cbp=12,0,0,0,0&output=svembed`}
          className="street-view-panel__iframe"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Street View"
        />
      </div>
      <div className="street-view-panel__footer">
        <a
          href={`https://www.google.com/maps/@${coords.lat},${coords.lng},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192`}
          target="_blank"
          rel="noopener noreferrer"
          className="street-view-panel__link"
        >
          Open in Google Maps
        </a>
        <a
          href={mapillaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="street-view-panel__link"
        >
          Mapillary
        </a>
      </div>
    </div>
  );
}

export default StreetView;
