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
    <div style={{
      position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
      zIndex: 1200, display: 'flex', flexDirection: 'column', gap: 4
    }}>
      <button onClick={() => zoom('in')} style={btnStyle}>+</button>
      <button onClick={() => zoom('out')} style={btnStyle}>−</button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 40, height: 40,
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  background: 'rgba(0,0,0,0.75)',
  color: '#fff', fontSize: 20,
  cursor: 'pointer',
  backdropFilter: 'blur(12px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
};

export default ZoomControls;
