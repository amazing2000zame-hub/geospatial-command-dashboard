import { memo, useState } from 'react';

type VisualMode = 'normal' | 'nvc' | 'flir' | 'crt';

const MODES: { id: VisualMode; label: string; icon: string }[] = [
  { id: 'normal', label: 'NORMAL', icon: '◉' },
  { id: 'nvc', label: 'NVC', icon: '◎' },
  { id: 'flir', label: 'FLIR', icon: '◈' },
  { id: 'crt', label: 'CRT', icon: '▦' },
];

interface Props {
  onModeChange?: (mode: VisualMode) => void;
}

function ModeSelector({ onModeChange }: Props) {
  const [active, setActive] = useState<VisualMode>('normal');

  const handleClick = (mode: VisualMode) => {
    setActive(mode);
    onModeChange?.(mode);
    applyMode(mode);
  };

  return (
    <div className="mode-selector">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`mode-selector__btn ${active === m.id ? 'mode-selector__btn--active' : ''}`}
          onClick={() => handleClick(m.id)}
        >
          {m.icon} {m.label}
        </button>
      ))}
    </div>
  );
}

function applyMode(mode: VisualMode) {
  const canvas = document.querySelector('.cesium-viewer canvas') as HTMLCanvasElement;
  const viewer = document.querySelector('.cesium-viewer') as HTMLElement;
  if (!viewer) return;

  // Remove all mode classes
  viewer.classList.remove('mode-nvc', 'mode-flir', 'mode-crt');

  switch (mode) {
    case 'nvc':
      viewer.classList.add('mode-nvc');
      break;
    case 'flir':
      viewer.classList.add('mode-flir');
      break;
    case 'crt':
      viewer.classList.add('mode-crt');
      break;
    default:
      break;
  }
}

export default memo(ModeSelector);
