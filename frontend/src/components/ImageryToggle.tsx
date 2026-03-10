import { useUiStore, type ImageryMode } from '../store/uiStore';

const modes: { value: ImageryMode; label: string }[] = [
  { value: 'satellite', label: 'SAT' },
  { value: 'hybrid', label: 'HYB' },
  { value: 'map', label: 'MAP' },
];

function ImageryToggle() {
  const current = useUiStore((s) => s.imageryMode);
  const setMode = useUiStore((s) => s.setImageryMode);

  return (
    <div className="imagery-toggle">
      {modes.map((m) => (
        <button
          key={m.value}
          className={`imagery-toggle__btn${current === m.value ? ' imagery-toggle__btn--active' : ''}`}
          onClick={() => setMode(m.value)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default ImageryToggle;
