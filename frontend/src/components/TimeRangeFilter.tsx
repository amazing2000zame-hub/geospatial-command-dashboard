import { useState, useCallback } from 'react';
import { useUiStore } from '../store/uiStore';

const PRESETS = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '3D', hours: 72 },
  { label: '7D', hours: 168 },
  { label: 'ALL', hours: 0 },
] as const;

function TimeRangeFilter() {
  const timeFilter = useUiStore((s) => s.timeFilter);
  const setTimeFilter = useUiStore((s) => s.setTimeFilter);
  const [active, setActive] = useState<number>(0); // 0 = ALL

  const handlePreset = useCallback((hours: number) => {
    setActive(hours);
    if (hours === 0) {
      setTimeFilter(null);
    } else {
      const now = Math.floor(Date.now() / 1000);
      setTimeFilter({ start: now - hours * 3600, end: now });
    }
  }, [setTimeFilter]);

  return (
    <div className="time-filter">
      <span className="time-filter__label">TIME</span>
      <div className="time-filter__presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={`time-filter__btn ${active === p.hours ? 'time-filter__btn--active' : ''}`}
            onClick={() => handlePreset(p.hours)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {timeFilter && (
        <span className="time-filter__info">
          {new Date(timeFilter.start * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          {' - now'}
        </span>
      )}
    </div>
  );
}

export default TimeRangeFilter;
