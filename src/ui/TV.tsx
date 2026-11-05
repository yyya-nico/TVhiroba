import { useAutoHideControls } from './useAutoHideControls';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { AppShellProps } from './App';
import { Mpeg2TsPlayer } from '../../vendor/mpeg2toh264-player/src/index.js';
import { readTvPreferences, saveTvPreferences } from './tvPreferences';

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
  Shell: ComponentType<AppShellProps>;
};

export default function TV({ services: availableServices, message, onMessage: setMessage, busy, canRefresh, onRefresh, onHome, Shell }: TVProps) {
  const [selected, setSelected] = useState<TvService | null>(null);
  const [controlsVisible, setControlsVisible] = useAutoHideControls(Boolean(selected), selected);
  const playbackStartedRef = useRef(false);
  const hideOnPlaybackRef = useRef(false);
  const autoSelectPendingRef = useRef(true);
  const preferencesRef = useRef<ReturnType<typeof readTvPreferences> | null>(null);
  if (preferencesRef.current === null) preferencesRef.current = readTvPreferences();
  const preferences = preferencesRef.current;
  const [broadcastType, setBroadcastType] = useState(preferences.broadcastType);
  const channelListRef = useRef<HTMLDivElement>(null);
  const channelNumberCycleRef = useRef<{ key: number; serviceId: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Mpeg2TsPlayer | null>(null);

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

  const onPlaying = () => {
    if (playbackStartedRef.current) return;
    playbackStartedRef.current = true;
    if (hideOnPlaybackRef.current) setControlsVisible(false);
  };

  const onBroadcastType = (type: string) => {
    const typeServices = services.filter((service) => service.channelType.toUpperCase() === type);
    const firstService = typeServices.find((service) => service.id === preferences.channels[type]) ?? typeServices[0];
    autoSelectPendingRef.current = !firstService;
    hideOnPlaybackRef.current = false;
    setBroadcastType(type);
    preferences.broadcastType = type;
    saveTvPreferences(preferences);
    setControlsVisible(true);
    if (firstService) {
      rememberChannel(firstService);
      setSelected(firstService);
      setMessage(`${firstService.name} に接続中…`);
    }
  };
  const rememberChannel = useCallback((service: TvService) => {
    const type = service.channelType.toUpperCase();
    preferences.broadcastType = type;
    preferences.channels[type] = service.id;
    saveTvPreferences(preferences);
  }, [preferences]);
  const onSelect = useCallback((service: TvService) => {
    rememberChannel(service);
    autoSelectPendingRef.current = false;
    hideOnPlaybackRef.current = true;
    setSelected(service);
    setMessage(`${service.name} に接続中…`);
  }, [rememberChannel, setMessage]);
  const services = useMemo(() => availableServices.filter((service) => Boolean(service.currentProgram?.name?.trim()))
    .sort((a, b) => {
      const typeA = a.channelType.toUpperCase();
      const typeB = b.channelType.toUpperCase();
      const typeOrder = (channelTypeOrder[typeA] ?? 5) - (channelTypeOrder[typeB] ?? 5)
        || typeA.localeCompare(typeB);
      if (typeOrder) return typeOrder;
      return (a.remoteControlKeyId ?? Infinity) - (b.remoteControlKeyId ?? Infinity);
    }), [availableServices]);
  const broadcastTypes = Array.from(new Set(['GR', 'BS', 'CS', ...services.map((service) => service.channelType.toUpperCase())]));
  const broadcastLabels: Record<string, string> = { GR: '地デジ', BS: 'BS', CS: 'CS', SKY: 'スカパー！', BS4K: 'BS4K' };
  const displayedServices = useMemo(() => services.filter((service) => service.channelType.toUpperCase() === broadcastType), [services, broadcastType]);
  useEffect(() => {
    const handleRemoteKeys = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const isTextEntry = event.target instanceof Element
        && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
      if (isTextEntry) return;

      const remoteKey = /^[0-9]$/.test(event.key) ? Number(event.key) || 10
        : event.key === 'F11' ? 11 : event.key === 'F12' ? 12 : null;
      const isChannelStep = event.key === 'PageUp' || event.key === 'PageDown';
      const isBroadcastCycle = event.key.toLowerCase() === 'b';
      if (remoteKey !== null) {
        setControlsVisible(false);
      } else if (isChannelStep || isBroadcastCycle || event.key.startsWith('Arrow')) {
        setControlsVisible(true);
      }

      if (remoteKey !== null) {
        event.preventDefault();
        const matches = displayedServices.filter((service) => service.remoteControlKeyId === remoteKey);
        if (!matches.length) {
          channelNumberCycleRef.current = null;
          return;
        }
        const previous = channelNumberCycleRef.current;
        const previousIndex = previous?.key === remoteKey
          ? matches.findIndex((service) => service.id === previous.serviceId)
          : -1;
        const nextIndex = previousIndex >= 0
          ? (previousIndex + 1) % matches.length
          : Math.max(0, matches.findIndex((service) => !service.isSubchannel));
        const service = matches[nextIndex];
        channelNumberCycleRef.current = { key: remoteKey, serviceId: service.id };
        onSelect(service);
        return;
      }

      channelNumberCycleRef.current = null;
      const channelButtons = Array.from(channelListRef.current?.querySelectorAll<HTMLButtonElement>('button.program-service') ?? []);
      if (isChannelStep && channelButtons.length) {
        event.preventDefault();
        if (event.repeat) return;
        const currentIndex = channelButtons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
        const step = event.key === 'PageUp' ? 1 : -1;
        const nextIndex = currentIndex < 0 ? (step > 0 ? 0 : channelButtons.length - 1)
          : (currentIndex + step + channelButtons.length) % channelButtons.length;
        channelButtons[nextIndex]?.click();
        return;
      }

      if (isBroadcastCycle && !event.repeat) {
        const typeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.broadcast-types button'));
        if (typeButtons.length) {
          event.preventDefault();
          const currentIndex = typeButtons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
          typeButtons[(currentIndex + 1) % typeButtons.length]?.click();
        }
      }
    };
    window.addEventListener('keydown', handleRemoteKeys);
    return () => window.removeEventListener('keydown', handleRemoteKeys);
  }, [broadcastType, displayedServices, onSelect, setControlsVisible]);

  // Keep the request pending when channels are still loading or this type is empty.
  useEffect(() => {
    if (!autoSelectPendingRef.current || !displayedServices[0]) return;
    autoSelectPendingRef.current = false;
    hideOnPlaybackRef.current = false;
    const service = displayedServices.find((service) => service.id === preferences.channels[broadcastType]) ?? displayedServices[0];
    rememberChannel(service);
    setSelected(service);
    setControlsVisible(true);
    setMessage(`${service.name} に接続中…`);
  });
  const formatTime = (timestamp: number) => new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(timestamp);

  return <Shell autoHideTitle controlsVisible={controlsVisible} onToggle={() => setControlsVisible((visible) => !visible)}>
    <div className="player-frame">{selected && <video ref={videoRef} autoPlay playsInline onPlaying={onPlaying} />}</div>
    <header className="now-playing"><div><h1>{selected?.name ?? 'チャンネルを選択'}</h1>{selected?.currentProgram && <p className="watching-title">{selected.currentProgram.name}</p>}</div><span className="status-message" role="status">{message}</span></header>
    <button className="home-back" onClick={onHome}>← ホーム</button>
    <section className="viewer-overlay" aria-label="テレビの選局">
      <div className="list-heading"><h2>チャンネル <span>{services.length}</span></h2><div className="channel-actions"><button className="icon-button" onClick={onRefresh} disabled={!canRefresh || busy} aria-label="一覧を更新">↻</button></div></div>
      <div className="broadcast-types" role="group" aria-label="放送種別">{broadcastTypes.map((type) => <button key={type} type="button" aria-pressed={broadcastType === type} onClick={() => { onBroadcastType(type); channelListRef.current?.scrollTo({ top: 0 }); }}>{broadcastLabels[type] ?? type}</button>)}</div>
      {busy && services.length === 0 ? <div className="empty-state">チャンネルと番組情報を読み込み中…</div> : displayedServices.length === 0 ? <div className="empty-state">この放送種別には現在の番組情報があるサービスがありません。</div> : <div className="channel-list" ref={channelListRef}>{displayedServices.map((service) => <button key={service.id} className={`program-service ${selected?.id === service.id ? 'selected' : ''}`} aria-pressed={selected?.id === service.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })} onClick={() => onSelect(service)}>
          <span className="service-name-line">{service.remoteControlKeyId != null && <span className="remote-control-key" aria-label={`リモコン番号 ${service.remoteControlKeyId}`}>{service.remoteControlKeyId}</span>}<strong>{service.name}</strong><span className="service-id">{selected?.id === service.id ? '視聴中' : service.channelType}</span></span>
          <span className="current-program"><strong>{service.currentProgram?.name ?? '番組情報なし'}</strong>
            {service.currentProgram && <span className="program-time">{formatTime(service.currentProgram.startAt)} – {formatTime(service.currentProgram.startAt + service.currentProgram.duration)}</span>}
          </span>
          <span className="next-program"><span className="program-label">次</span><span>{service.nextProgram?.name ?? '番組情報なし'}</span></span>
        </button>)}</div>}
    </section>
  </Shell>;
}
