import { useGlobe } from './Globe';

function ZoomControls() {
  const { getViewer } = useGlobe();

  const zoom = (direction: 'in' | 'out') => {
    const viewer = getViewer();
    if (!viewer) return;
    const camera = viewer.camera;
    const amount = direction === 'in' ? -camera.positionCartographic.height * 0.3 : camera.positionCartographic.height * 0.5;
    camera.zoomIn(-amount);
  };

  return (
    <div className="zoom-controls">
      <button onClick={() => zoom('in')}>+</button>
      <button onClick={() => zoom('out')}>&minus;</button>
    </div>
  );
}

export default ZoomControls;
