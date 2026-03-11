import { useState, useCallback, useEffect, useRef } from 'react';
import { useUiStore } from '../store/uiStore';

const PLAYBACK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes of data shown at once
const RANGE_HOURS = 24;
const STEP_MS = 60_000; // 1 minute granularity

const SPEEDS = [1, 2, 10] as const;
type Speed = (typeof SPEEDS)[number];

/**
 * Format a unix ms timestamp to a short time string (e.g. "03:45 PM").
 */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a unix ms timestamp to a compact hour label (e.g. "3P").
 */
function formatHourTick(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const ampm = h >= 12 ? 'P' : 'A';
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

function HistoricalPlayback() {
  const setTimeFilter = useUiStore((s) => s.setTimeFilter);
  const setPlaybackActive = useUiStore((s) => s.setPlaybackActive);
  const timeFilter = useUiStore((s) => s.timeFilter);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [expanded, setExpanded] = useState(false);

  // Playback position in unix ms.  null = live mode (not scrubbing).
  const [position, setPosition] = useState<number | null>(null);

  // Ref to saved time filter before playback started, so we can restore it.
  const savedFilterRef = useRef(timeFilter);

  // Compute slider bounds (re-evaluated on each render, cheap).
  const now = Date.now();
  const rangeStart = now - RANGE_HOURS * 3600_000;

  // ------ Playback tick ------
  useEffect(() => {
    if (!isPlaying || position === null) return;

    // Advance 1 minute of data per (1000/speed) ms of real time.
    const intervalMs = 1000 / speed;

    const id = setInterval(() => {
      setPosition((prev) => {
        if (prev === null) return null;
        const next = prev + STEP_MS;
        if (next >= Date.now()) {
          // Reached live — stop playback
          setIsPlaying(false);
          return Date.now();
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(id);
  }, [isPlaying, speed, position]);

  // ------ Sync position → uiStore.timeFilter ------
  useEffect(() => {
    if (position === null) return;

    const start = Math.floor((position - PLAYBACK_WINDOW_MS) / 1000);
    const end = Math.floor(position / 1000);
    setTimeFilter({ start, end });
  }, [position, setTimeFilter]);

  // ------ Handlers ------
  const handleToggleExpand = useCallback(() => {
    if (expanded) {
      // Collapsing — stop and restore live mode
      setExpanded(false);
      setIsPlaying(false);
      setPosition(null);
      setPlaybackActive(false);
      setTimeFilter(savedFilterRef.current);
    } else {
      // Expanding — save current filter
      savedFilterRef.current = timeFilter;
      setExpanded(true);
      setPlaybackActive(true);
      setPosition(Date.now());
    }
  }, [expanded, timeFilter, setTimeFilter, setPlaybackActive]);

  const handlePlayPause = useCallback(() => {
    if (position === null) {
      // Start from current time
      setPosition(Date.now());
    }
    setIsPlaying((p) => !p);
  }, [position]);

  const handleRewind = useCallback(() => {
    setPosition((prev) => {
      const base = prev ?? Date.now();
      return Math.max(rangeStart, base - 3600_000);
    });
    setIsPlaying(false);
  }, [rangeStart]);

  const handleForward = useCallback(() => {
    setPosition((prev) => {
      const base = prev ?? Date.now();
      return Math.min(Date.now(), base + 3600_000);
    });
    setIsPlaying(false);
  }, []);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setPosition(val);
      setIsPlaying(false);
    },
    [],
  );

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setPosition(null);
    setPlaybackActive(false);
    setTimeFilter(savedFilterRef.current);
  }, [setTimeFilter, setPlaybackActive]);

  // ------ Hour ticks for the slider ------
  const hourTicks: number[] = [];
  {
    // Start from the first full hour after rangeStart
    const firstHour =
      Math.ceil(rangeStart / 3600_000) * 3600_000;
    for (let t = firstHour; t <= now; t += 3600_000) {
      hourTicks.push(t);
    }
  }

  // ------ Collapsed state: just show a toggle button ------
  if (!expanded) {
    return (
      <button onClick={handleToggleExpand} style={styles.toggleBtn}>
        PLAYBACK
      </button>
    );
  }

  const sliderValue = position ?? now;
  const progress =
    ((sliderValue - rangeStart) / (now - rangeStart)) * 100;

  return (
    <div style={styles.container}>
      {/* Close / live button */}
      <button onClick={handleReset} style={styles.liveBtn} title="Return to live">
        LIVE
      </button>

      {/* Rewind */}
      <button
        onClick={handleRewind}
        style={styles.transportBtn}
        title="Rewind 1 hour"
      >
        &#x25C0;&#x25C0;
      </button>

      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        style={{
          ...styles.transportBtn,
          ...(isPlaying ? styles.transportBtnActive : {}),
        }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '\u275A\u275A' : '\u25B6'}
      </button>

      {/* Forward */}
      <button
        onClick={handleForward}
        style={styles.transportBtn}
        title="Forward 1 hour"
      >
        &#x25B6;&#x25B6;
      </button>

      {/* Timeline slider container */}
      <div style={styles.sliderContainer}>
        {/* Tick marks */}
        <div style={styles.tickContainer}>
          {hourTicks.map((t) => {
            const pct =
              ((t - rangeStart) / (now - rangeStart)) * 100;
            return (
              <div
                key={t}
                style={{
                  ...styles.tick,
                  left: `${pct}%`,
                }}
              >
                <div style={styles.tickMark} />
                <span style={styles.tickLabel}>
                  {formatHourTick(t)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Range input */}
        <input
          type="range"
          min={rangeStart}
          max={now}
          step={STEP_MS}
          value={sliderValue}
          onChange={handleSliderChange}
          className="playback-slider"
          style={styles.slider}
        />

        {/* Progress fill (visual only) */}
        <div
          style={{
            ...styles.sliderFill,
            width: `${progress}%`,
          }}
        />
      </div>

      {/* Speed buttons */}
      <div style={styles.speedGroup}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            style={{
              ...styles.speedBtn,
              ...(speed === s ? styles.speedBtnActive : {}),
            }}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Current time label */}
      <span style={styles.timeLabel}>{formatTime(sliderValue)}</span>

      {/* Close button */}
      <button onClick={handleToggleExpand} style={styles.closeBtn} title="Close playback">
        &times;
      </button>

      {/* Inline style tag for slider thumb customization */}
      <style>{sliderCSS}</style>
    </div>
  );
}

// ─── CSS-in-JS styles matching the HUD theme ────────────────────────

const ACCENT = '#00ffcc';
const ACCENT_DIM = 'rgba(0, 255, 204, 0.4)';
const BORDER = 'rgba(0, 255, 255, 0.15)';
const BG = 'rgba(0, 0, 0, 0.8)';
const TEXT_DIM = '#6a7580';
const TEXT_SEC = '#8a94a0';
const FONT = "'JetBrains Mono', monospace";

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 88,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '6px 14px',
    backdropFilter: 'blur(16px)',
    fontFamily: FONT,
    fontSize: 11,
    color: TEXT_SEC,
    whiteSpace: 'nowrap',
  },
  toggleBtn: {
    position: 'fixed',
    bottom: 88,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '6px 16px',
    fontFamily: FONT,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: TEXT_DIM,
    cursor: 'pointer',
    backdropFilter: 'blur(12px)',
    transition: 'all 0.2s',
  },
  transportBtn: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: ACCENT,
    fontFamily: FONT,
    fontSize: 10,
    padding: '4px 6px',
    cursor: 'pointer',
    lineHeight: 1,
    transition: 'all 0.15s',
    minWidth: 28,
    textAlign: 'center' as const,
  },
  transportBtnActive: {
    background: 'rgba(0, 255, 204, 0.12)',
    borderColor: ACCENT,
    boxShadow: `0 0 8px rgba(0, 255, 204, 0.2)`,
  },
  liveBtn: {
    background: 'rgba(255, 42, 42, 0.15)',
    border: '1px solid rgba(255, 42, 42, 0.3)',
    borderRadius: 4,
    color: '#ff4444',
    fontFamily: FONT,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.5,
    padding: '4px 8px',
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
    transition: 'all 0.15s',
  },
  sliderContainer: {
    position: 'relative' as const,
    width: 240,
    height: 28,
    display: 'flex',
    alignItems: 'center',
  },
  slider: {
    width: '100%',
    height: 4,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    outline: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    zIndex: 2,
  },
  sliderFill: {
    position: 'absolute' as const,
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    height: 4,
    borderRadius: 2,
    background: `linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT})`,
    pointerEvents: 'none' as const,
    zIndex: 1,
  },
  tickContainer: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  tick: {
    position: 'absolute' as const,
    top: 0,
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    height: '100%',
  },
  tickMark: {
    width: 1,
    height: 6,
    background: 'rgba(255, 255, 255, 0.12)',
  },
  tickLabel: {
    fontSize: 7,
    color: TEXT_DIM,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  speedGroup: {
    display: 'flex',
    gap: 2,
  },
  speedBtn: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 3,
    color: TEXT_DIM,
    fontFamily: FONT,
    fontSize: 9,
    padding: '3px 6px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  speedBtnActive: {
    background: 'rgba(0, 255, 204, 0.15)',
    borderColor: ACCENT,
    color: ACCENT,
    fontWeight: 600,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: ACCENT,
    letterSpacing: 0.5,
    minWidth: 72,
    textAlign: 'center' as const,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: TEXT_DIM,
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    fontFamily: FONT,
  },
};

// Custom CSS for slider thumb — cannot be done with inline styles alone.
const sliderCSS = `
  .playback-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${ACCENT};
    box-shadow: 0 0 8px rgba(0, 255, 204, 0.5);
    cursor: pointer;
    border: none;
  }
  .playback-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${ACCENT};
    box-shadow: 0 0 8px rgba(0, 255, 204, 0.5);
    cursor: pointer;
    border: none;
  }
  .playback-slider::-webkit-slider-runnable-track {
    height: 4px;
    background: transparent;
    border-radius: 2px;
  }
  .playback-slider::-moz-range-track {
    height: 4px;
    background: transparent;
    border-radius: 2px;
  }
`;

export default HistoricalPlayback;
