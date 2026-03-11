import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface NewsItem {
  title: string;
  source: string;
  link: string;
  pubDate: string;
  summary: string;
}

interface CryptoPrice {
  name: string;
  price: number;
  change24h: number;
}

interface EconomyData {
  crypto: CryptoPrice[];
  fearGreed: { value: number; classification: string } | null;
  gold: { price: number; change: number } | null;
}

interface Situation {
  region: string;
  country: string;
  eventCount: number;
  actors: string[];
  latestEvent: string;
  severity: number;
  summary: string;
}

interface ScannerCall {
  id: string;
  system: string;
  systemLabel: string;
  talkgroup: string;
  freq: number;
  audioUrl: string;
  time: string;
  duration: number;
  starred: boolean;
}

type Tab = 'news' | 'situations' | 'economy' | 'scanner';

const TAB_LABELS: Record<Tab, string> = {
  news: 'NEWS',
  situations: 'SITUATIONS',
  economy: 'ECONOMY',
  scanner: 'SCANNER',
};

const DEFAULT_TAB_ORDER: Tab[] = ['news', 'situations', 'economy', 'scanner'];

let intelSocket: Socket | null = null;

function getIntelSocket(): Socket {
  if (!intelSocket) {
    intelSocket = io('/layers', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
  }
  return intelSocket;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function IntelPanel() {
  const [tab, setTab] = useState<Tab>('news');
  const [collapsed, setCollapsed] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [economy, setEconomy] = useState<EconomyData | null>(null);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [scanner, setScanner] = useState<ScannerCall[]>([]);
  const [tabOrder, setTabOrder] = useState<Tab[]>(() => {
    try {
      const saved = localStorage.getItem('intel-tab-order');
      if (saved) {
        const parsed = JSON.parse(saved) as Tab[];
        if (parsed.length === DEFAULT_TAB_ORDER.length && DEFAULT_TAB_ORDER.every(t => parsed.includes(t))) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return [...DEFAULT_TAB_ORDER];
  });
  const [dragOver, setDragOver] = useState<Tab | null>(null);
  const draggedTab = useRef<Tab | null>(null);

  // Subscribe to intel feeds
  useEffect(() => {
    const socket = getIntelSocket();

    function onIntelData(payload: { channel: string; data: unknown }) {
      switch (payload.channel) {
        case 'news': {
          const d = payload.data as { items?: NewsItem[] };
          setNews(d.items || []);
          break;
        }
        case 'economy':
          setEconomy(payload.data as EconomyData);
          break;
        case 'situations': {
          const d = payload.data as { situations?: Situation[] };
          setSituations(d.situations || []);
          break;
        }
        case 'scanner': {
          const d = payload.data as { calls?: ScannerCall[] };
          setScanner(d.calls || []);
          break;
        }
      }
    }

    socket.on('intel-data', onIntelData);
    socket.emit('subscribe-intel');

    return () => {
      socket.off('intel-data', onIntelData);
    };
  }, []);

  const handleTabClick = useCallback((t: Tab) => {
    setTab(t);
    if (collapsed) setCollapsed(false);
  }, [collapsed]);

  const onDragStart = useCallback((t: Tab) => {
    draggedTab.current = t;
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, t: Tab) => {
    e.preventDefault();
    setDragOver(t);
  }, []);

  const onDrop = useCallback((targetTab: Tab) => {
    const src = draggedTab.current;
    if (!src || src === targetTab) {
      draggedTab.current = null;
      setDragOver(null);
      return;
    }
    setTabOrder(prev => {
      const next = [...prev];
      const srcIdx = next.indexOf(src);
      const tgtIdx = next.indexOf(targetTab);
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, src);
      localStorage.setItem('intel-tab-order', JSON.stringify(next));
      return next;
    });
    draggedTab.current = null;
    setDragOver(null);
  }, []);

  const onDragEnd = useCallback(() => {
    draggedTab.current = null;
    setDragOver(null);
  }, []);

  const badgeCount = useCallback((t: Tab): number | null => {
    if (t === 'news' && news.length > 0) return news.length;
    if (t === 'situations' && situations.length > 0) return situations.length;
    if (t === 'scanner' && scanner.length > 0) return scanner.length;
    return null;
  }, [news.length, situations.length, scanner.length]);

  if (collapsed) {
    return (
      <div className="intel-panel intel-panel--collapsed" onClick={() => setCollapsed(false)}>
        <div className="intel-panel__tab-bar">
          <span className="intel-panel__collapse-label">INTEL FEED</span>
          <span className="intel-panel__expand-btn">&#9654;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="intel-panel">
      <div className="intel-panel__header">
        <div className="intel-panel__tab-bar">
          {tabOrder.map((t) => {
            const badge = badgeCount(t);
            return (
              <button
                key={t}
                className={
                  `intel-panel__tab` +
                  (tab === t ? ' intel-panel__tab--active' : '') +
                  (dragOver === t ? ' intel-panel__tab--drag-over' : '')
                }
                draggable
                onClick={() => handleTabClick(t)}
                onDragStart={() => onDragStart(t)}
                onDragOver={(e) => onDragOver(e, t)}
                onDrop={() => onDrop(t)}
                onDragEnd={onDragEnd}
              >
                {TAB_LABELS[t]}
                {badge !== null && (
                  <span className="intel-panel__badge">{badge}</span>
                )}
              </button>
            );
          })}
        </div>
        <button className="intel-panel__close" onClick={() => setCollapsed(true)}>&times;</button>
      </div>

      <div className="intel-panel__content">
        {tab === 'news' && <NewsTab items={news} />}
        {tab === 'situations' && <SituationsTab items={situations} />}
        {tab === 'economy' && <EconomyTab data={economy} />}
        {tab === 'scanner' && <ScannerTab calls={scanner} />}
      </div>
    </div>
  );
}

function NewsTab({ items }: { items: NewsItem[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (items.length === 0) {
    return <div className="intel-panel__empty">Loading news feed...</div>;
  }

  return (
    <div className="intel-panel__list">
      {items.slice(0, 30).map((item, i) => (
        <div
          key={i}
          className={`intel-panel__news-item ${expanded === i ? 'intel-panel__news-item--expanded' : ''}`}
          onClick={() => setExpanded(expanded === i ? null : i)}
        >
          <div className="intel-panel__news-header">
            <span className="intel-panel__news-source">{item.source}</span>
            <span className="intel-panel__news-time">{timeAgo(item.pubDate)}</span>
          </div>
          <div className="intel-panel__news-title">{item.title}</div>
          {expanded === i ? (
            <>
              {item.summary && (
                <div className="intel-panel__news-summary">{item.summary}</div>
              )}
              {item.link && (
                <a
                  className="intel-panel__news-link"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open article &#8599;
                </a>
              )}
            </>
          ) : (
            item.summary && (
              <div className="intel-panel__news-summary">
                {item.summary.slice(0, 80)}{item.summary.length > 80 ? '...' : ''}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function SituationsTab({ items }: { items: Situation[] }) {
  if (items.length === 0) {
    return <div className="intel-panel__empty">Analyzing conflict data...</div>;
  }

  return (
    <div className="intel-panel__list">
      {items.map((sit, i) => (
        <div key={i} className="intel-panel__situation-item">
          <div className="intel-panel__situation-header">
            <span className="intel-panel__situation-region">{sit.region || sit.country}</span>
            <span
              className="intel-panel__situation-severity"
              style={{
                color: sit.severity > 0.7 ? '#ff2a2a' : sit.severity > 0.4 ? '#ffaa00' : '#34d399',
              }}
            >
              {sit.eventCount} events
            </span>
          </div>
          <div className="intel-panel__situation-summary">{sit.summary}</div>
          {sit.actors.length > 0 && (
            <div className="intel-panel__situation-actors">
              {sit.actors.slice(0, 3).map((a, j) => (
                <span key={j} className="intel-panel__actor-tag">{a}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EconomyTab({ data }: { data: EconomyData | null }) {
  if (!data) {
    return <div className="intel-panel__empty">Loading economic data...</div>;
  }

  return (
    <div className="intel-panel__economy">
      {/* Crypto prices */}
      {data.crypto && data.crypto.length > 0 && (
        <div className="intel-panel__eco-section">
          <div className="intel-panel__eco-label">CRYPTO</div>
          {data.crypto.map((c, i) => (
            <div key={i} className="intel-panel__eco-row">
              <span className="intel-panel__eco-name">{c.name}</span>
              <span className="intel-panel__eco-price">${formatPrice(c.price)}</span>
              <span
                className="intel-panel__eco-change"
                style={{ color: c.change24h >= 0 ? '#34d399' : '#ff4444' }}
              >
                {c.change24h >= 0 ? '+' : ''}{c.change24h?.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Fear & Greed */}
      {data.fearGreed && (
        <div className="intel-panel__eco-section">
          <div className="intel-panel__eco-label">MARKET SENTIMENT</div>
          <div className="intel-panel__fear-greed">
            <div className="intel-panel__fg-gauge">
              <div
                className="intel-panel__fg-fill"
                style={{
                  width: `${data.fearGreed.value}%`,
                  background: data.fearGreed.value < 25 ? '#ff4444'
                    : data.fearGreed.value < 45 ? '#ffaa00'
                    : data.fearGreed.value < 55 ? '#888'
                    : data.fearGreed.value < 75 ? '#34d399'
                    : '#00ff88',
                }}
              />
            </div>
            <div className="intel-panel__fg-text">
              <span>{data.fearGreed.value}</span>
              <span className="intel-panel__fg-class">{data.fearGreed.classification}</span>
            </div>
          </div>
        </div>
      )}

      {/* Gold */}
      {data.gold && (
        <div className="intel-panel__eco-section">
          <div className="intel-panel__eco-label">COMMODITIES</div>
          <div className="intel-panel__eco-row">
            <span className="intel-panel__eco-name">Gold (XAU)</span>
            <span className="intel-panel__eco-price">${formatPrice(data.gold.price)}</span>
            {data.gold.change !== 0 && (
              <span
                className="intel-panel__eco-change"
                style={{ color: data.gold.change >= 0 ? '#34d399' : '#ff4444' }}
              >
                {data.gold.change >= 0 ? '+' : ''}{data.gold.change.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScannerTab({ calls }: { calls: ScannerCall[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = useCallback((call: ScannerCall) => {
    if (playing === call.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(call.audioUrl);
    audio.play().catch(() => {});
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    setPlaying(call.id);
  }, [playing]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (calls.length === 0) {
    return (
      <div className="intel-panel__empty">
        <div>No scanner audio available</div>
        <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>OpenMHz API currently unavailable</div>
      </div>
    );
  }

  return (
    <div className="intel-panel__list">
      {calls.slice(0, 30).map((call) => (
        <div
          key={call.id}
          className={`intel-panel__scanner-item ${playing === call.id ? 'intel-panel__scanner-item--playing' : ''}`}
          onClick={() => togglePlay(call)}
        >
          <div className="intel-panel__scanner-header">
            <span className="intel-panel__scanner-system">{call.systemLabel}</span>
            <span className="intel-panel__scanner-time">{timeAgo(call.time)}</span>
          </div>
          <div className="intel-panel__scanner-talkgroup">{call.talkgroup || `${(call.freq / 1e6).toFixed(3)} MHz`}</div>
          <div className="intel-panel__scanner-meta">
            <span className="intel-panel__scanner-duration">{call.duration}s</span>
            {playing === call.id && <span className="intel-panel__scanner-playing">PLAYING</span>}
            {call.starred && <span className="intel-panel__scanner-star">&#9733;</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default IntelPanel;
