import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { AppShellProps } from './App';
import { Mpeg2TsPlayer } from '../../vendor/mpeg2toh264-player/src/index.js';

export type TvProgram = { id?: number; name?: string; description?: string; startAt: number; duration: number };
export type TvService = { id: number; serviceId: number; networkId?: number; remoteControlKeyId?: number; name: string; type?: number; channelType: string; isSubchannel: boolean; currentProgram: TvProgram | null; nextProgram: TvProgram | null };


const channelTypeOrder: Record<string, number> = { GR: 0, BS: 1, CS: 2, SKY: 3, BS4K: 4 };

type TVProps = {
  services: TvService[];
  message: string;
  onMessage: (message: string) => void;
  busy: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  onHome: () => void;
  onSettings: () => void;
  Shell: ComponentType<AppShellProps>;
};

export default function TV({ services: availableServices, message, onMessage: setMessage, busy, canRefresh, onRefresh, onHome, onSettings, Shell }: TVProps) {
  const [selected, setSelected] = useState<TvService | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const playbackStartedRef = useRef(false);
  const [broadcastType, setBroadcastType] = useState('GR');
  const channelListRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Mpeg2TsPlayer | null>(null);

  useEffect(() => {
    const focusAdjacentChannel = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const buttons = Array.from(channelListRef.current?.querySelectorAll<HTMLButtonElement>('button.program-service') ?? []);
      if (buttons.length === 0) return;
      const index = buttons.findIndex((button) => button === document.activeElement);
      const selectedIndex = buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
      const nextIndex = index < 0 ? Math.max(0, selectedIndex) : index + (event.key === 'ArrowRight' ? 1 : -1);
      event.preventDefault();
      buttons[nextIndex]?.focus();
    };
    window.addEventListener('keydown', focusAdjacentChannel);
    return () => window.removeEventListener('keydown', focusAdjacentChannel);
  }, []);

  useEffect(() => {
    playbackStartedRef.current = false;
    playerRef.current?.destroy(); playerRef.current = null;
    if (!selected || !videoRef.current) return;
    const streamUrl = new URL(`/api/stream/${selected.id}`, window.location.href).toString();
    let disposed = false;
    const video = videoRef.current;
    const player = new Mpeg2TsPlayer(video);
    playerRef.current = player;
    player.addEventListener('error', (event) => {
      const detail = (event as CustomEvent<{ error?: unknown }>).detail;
      if (!disposed) setMessage(`再生エラー: ${detail?.error instanceof Error ? detail.error.message : String(detail?.error ?? '不明なエラー')}`);
    });
    void player.load(streamUrl).then(async () => {
      if (disposed) return;
      try {
        await video.play();
        if (!disposed) setMessage('');
      } catch (error) {
        if (!disposed) setMessage(error instanceof Error ? `再生を開始できません: ${error.message}` : '再生を開始できません');
      }
    }).catch((error: unknown) => {
      if (!disposed) setMessage(error instanceof Error ? `再生を開始できません: ${error.message}` : '再生を開始できません');
    });
    return () => { disposed = true; player.destroy(); playerRef.current = null; };
  }, [selected]);

  useEffect(() => {
    setUiVisible(true);
    if (message || !selected) setControlsVisible(true);
  }, [selected, message]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cursorTimer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      if (!selected || message) return;
      timer = setTimeout(() => {
        setUiVisible(false);
        setControlsVisible(false);
      }, 4000);
    };
    const showOnMouseMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      setCursorVisible(true);
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => setCursorVisible(false), 4000);
      resetTimer();
    };
    window.addEventListener('pointermove', showOnMouseMove, { passive: true });
    const activityEvents = ['keydown', 'wheel', 'focusin'] as const;
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    window.addEventListener('pointerdown', resetTimer, { passive: true });
    resetTimer();
    return () => {
      clearTimeout(timer);
      clearTimeout(cursorTimer);
      window.removeEventListener('pointermove', showOnMouseMove);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
      window.removeEventListener('pointerdown', resetTimer);
    };
  }, [selected, message]);

  const onBroadcastType = setBroadcastType;
  const onSelect = (service: TvService) => { setSelected(service); setMessage(`${service.name} に接続中…`); };
  const onPlaying = () => {
    if (playbackStartedRef.current) return;
    playbackStartedRef.current = true;
    setControlsVisible(false);
  };
  const services = availableServices.filter((service) => Boolean(service.currentProgram?.name?.trim()))
    .sort((a, b) => {
      const typeA = a.channelType.toUpperCase();
      const typeB = b.channelType.toUpperCase();
      const typeOrder = (channelTypeOrder[typeA] ?? 5) - (channelTypeOrder[typeB] ?? 5)
        || typeA.localeCompare(typeB);
      if (typeOrder) return typeOrder;
      return (a.remoteControlKeyId ?? Infinity) - (b.remoteControlKeyId ?? Infinity);
    });

  const broadcastTypes = Array.from(new Set(['GR', 'BS', 'CS', ...services.map((service) => service.channelType.toUpperCase())]));
  const broadcastLabels: Record<string, string> = { GR: '地デジ', BS: 'BS', CS: 'CS', SKY: 'スカパー！', BS4K: 'BS4K' };
  const displayedServices = services.filter((service) => service.channelType.toUpperCase() === broadcastType);
  const formatTime = (timestamp: number) => new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(timestamp);

  return <Shell uiVisible={uiVisible} controlsVisible={controlsVisible} cursorVisible={cursorVisible} onSettings={onSettings} onToggle={() => {
    const visible = !(uiVisible && controlsVisible);
    setUiVisible(visible);
    setControlsVisible(visible);
  }}>
    <div className="player-frame">{selected && <video ref={videoRef} autoPlay playsInline onPlaying={onPlaying} />}</div>
    <header className="now-playing"><div><h1>{selected?.name ?? 'チャンネルを選択'}</h1>{selected?.currentProgram && <p className="watching-title">{selected.currentProgram.name}</p>}</div><span className="status-message" role="status">{message}</span></header>
    <button className="home-back" onClick={onHome}>← ホーム</button>
    <section className="viewer-overlay" aria-label="テレビの選局">
      <div className="list-heading"><h2>チャンネル <span>{services.length}</span></h2><div className="channel-actions"><button className="icon-button" onClick={onRefresh} disabled={!canRefresh || busy} aria-label="一覧を更新">↻</button></div></div>
      <div className="broadcast-types" role="group" aria-label="放送種別">{broadcastTypes.map((type) => <button key={type} type="button" aria-pressed={broadcastType === type} onClick={() => { onBroadcastType(type); channelListRef.current?.scrollTo({ top: 0 }); }}>{broadcastLabels[type] ?? type}</button>)}</div>
      {busy && services.length === 0 ? <div className="empty-state">チャンネルと番組情報を読み込み中…</div> : displayedServices.length === 0 ? <div className="empty-state">この放送種別には現在の番組情報があるサービスがありません。</div> : <div className="channel-list" ref={channelListRef}>{displayedServices.map((service) => <button key={service.id} className={`program-service ${selected?.id === service.id ? 'selected' : ''}`} aria-pressed={selected?.id === service.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })} onClick={() => onSelect(service)}>
          <span className="service-name-line"><strong>{service.name}</strong><span className="service-id">{selected?.id === service.id ? '視聴中' : service.channelType}</span></span>
          <span className="current-program"><strong>{service.currentProgram?.name ?? '番組情報なし'}</strong>
            {service.currentProgram && <span className="program-time">{formatTime(service.currentProgram.startAt)} – {formatTime(service.currentProgram.startAt + service.currentProgram.duration)}</span>}
          </span>
          <span className="next-program"><span className="program-label">次</span><span>{service.nextProgram?.name ?? '番組情報なし'}</span></span>
        </button>)}</div>}
    </section>
  </Shell>;
}
