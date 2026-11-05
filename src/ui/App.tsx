import { useEffect, useRef, useState } from 'react';
import Home from './Home';
import TV from './TV';
import { Mpeg2TsPlayer } from '../../vendor/mpeg2toh264-player/src/index.js';

export type TvProgram = { id?: number; name?: string; description?: string; startAt: number; duration: number };
export type TvService = { id: number; serviceId: number; networkId?: number; remoteControlKeyId?: number; name: string; type?: number; channelType: string; isSubchannel: boolean; currentProgram: TvProgram | null; nextProgram: TvProgram | null };
type TvChannel = { type: string; channel: string; name: string; services: TvService[] };
type ChannelResponse = { channels: TvChannel[]; programGuideAvailable: boolean; serviceCount: number; servicesWithGuide: number; generatedAt: number };
type Config = { mirakcUrl: string };
type SetupView = 'loading' | 'welcome' | 'connection' | 'done';
const channelTypeOrder: Record<string, number> = { GR: 0, BS: 1, CS: 2, SKY: 3, BS4K: 4 };
const hasCurrentProgram = (service: TvService) => Boolean(service.currentProgram?.name?.trim());
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body as T;
}

export default function App() {
  const [config, setConfig] = useState<Config>({ mirakcUrl: '' });
  const [address, setAddress] = useState('http://localhost:40772');
  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [screen, setScreen] = useState<'home' | 'tv'>('home');
  const [selected, setSelected] = useState<TvService | null>(null);
  const [message, setMessage] = useState('接続先を設定してください');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const playbackStartedRef = useRef(false);
  const [broadcastType, setBroadcastType] = useState('GR');
  const [setupView, setSetupView] = useState<SetupView>('loading');
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

  useEffect(() => { void json<Config>('/api/config').then((value) => { setConfig(value); if (value.mirakcUrl) { setAddress(value.mirakcUrl); setSetupView('done'); void loadChannels(); } else setSetupView('welcome'); }).catch((e) => { setMessage(e.message); setSetupView('welcome'); }); }, []);
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
    if (message || !selected || settingsOpen) setControlsVisible(true);
  }, [setupView, screen, selected, settingsOpen, message]);

  useEffect(() => {
    if (setupView !== 'done' || screen !== 'tv') return;
    let timer: ReturnType<typeof setTimeout>;
    let cursorTimer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      if (!selected || settingsOpen || message) return;
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
  }, [setupView, screen, selected, settingsOpen, message]);

  async function loadChannels() {
    setBusy(true); setMessage('チャンネルと番組情報を取得中…');
    try {
      const data = await json<ChannelResponse>('/api/tvhiroba/channels');
      setChannels(data.channels);
      const visibleCount = data.channels.reduce((count, channel) => count + channel.services.filter(hasCurrentProgram).length, 0);
      setMessage(`${visibleCount}サービスに現在の番組情報があります`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'チャンネル情報を取得できませんでした'); }
    finally { setBusy(false); }
  }
  async function saveAddress(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('接続を確認中…');
    try {
      const value = await json<{ mirakcUrl: string; version?: { current?: string } }>('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mirakcUrl: address }) });
      setConfig({ mirakcUrl: value.mirakcUrl }); setAddress(value.mirakcUrl); setSettingsOpen(false); setSetupView('done');
      setMessage(`mirakcに接続しました${value.version?.current ? ` (${value.version.current})` : ''}`); await loadChannels();
    } catch (error) { setMessage(error instanceof Error ? error.message : '接続できませんでした'); }
    finally { setBusy(false); }
  }
  const visibleServices = channels.flatMap((channel) => channel.services).filter(hasCurrentProgram)
    .sort((a, b) => {
      const typeA = a.channelType.toUpperCase();
      const typeB = b.channelType.toUpperCase();
      const typeOrder = (channelTypeOrder[typeA] ?? 5) - (channelTypeOrder[typeB] ?? 5)
        || typeA.localeCompare(typeB);
      if (typeOrder) return typeOrder;
      return (a.remoteControlKeyId ?? Infinity) - (b.remoteControlKeyId ?? Infinity);
    });

  if (setupView !== 'done') return <main className="setup-shell">
    {setupView === 'loading' ? <div className="setup-loading" role="status">設定を読み込んでいます…</div> : <section className="setup-content">
      <div className="setup-copy">
        {setupView === 'welcome' ? <>
          <h1>TVhirobaへようこそ</h1>
          <p className="setup-lead">いつものテレビ環境につないで、ブラウザから視聴を始めましょう。</p>
          <p className="setup-description">まずはMirakurun / mirakcのアドレスを登録します。接続先はあとから設定で変更できます。</p>
          <button className="setup-primary" onClick={() => { setMessage(''); setSetupView('connection'); }}>セットアップを始める <span aria-hidden="true">→</span></button>
        </> : <>
          <button className="setup-back" type="button" onClick={() => { setMessage(''); setSetupView('welcome'); }}>← はじめに戻る</button>
          <h1>テレビサーバーに接続</h1>
          <p className="setup-lead">Mirakurunまたはmirakcのアドレスを入力してください。</p>
          <form className="setup-form" onSubmit={saveAddress}>
            <label htmlFor="setup-mirakc-url">サーバーアドレス</label>
            <input id="setup-mirakc-url" type="url" placeholder="http://192.168.1.10:40772" value={address} onChange={(e) => setAddress(e.target.value)} required autoFocus />
            <p>例: http://mirakc-host:40772</p>
            {message && <div className="setup-message" role="status">{message}</div>}
            <button className="setup-primary" disabled={busy}>{busy ? '接続を確認中…' : '接続して次へ'} <span aria-hidden="true">→</span></button>
          </form>
        </>}
      </div>
    </section>}
  </main>;

  return <main className={`app-shell${screen === 'home' ? ' home-shell' : ''}${uiVisible ? '' : ' ui-hidden'}${controlsVisible ? '' : ' controls-hidden'}${cursorVisible ? '' : ' cursor-hidden'}`} onClick={(event) => {
    if (screen === 'home') return;
    if (event.target instanceof Element && event.target.closest('button, input, textarea, select, label')) return;
    const visible = !(uiVisible && controlsVisible);
    setUiVisible(visible);
    setControlsVisible(visible);
  }}>
    <div className="viewer-actions"><button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="接続設定" aria-expanded={settingsOpen}>⚙</button></div>
    {settingsOpen && <form className="settings-panel" onSubmit={saveAddress}><div className="settings-title"><label htmlFor="mirakc-url">テレビサーバーの接続設定</label><button type="button" className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる">×</button></div><div className="settings-row"><input id="mirakc-url" type="url" placeholder="http://192.168.1.10:40772" value={address} onChange={(e) => setAddress(e.target.value)} required /><button disabled={busy}>{busy ? '確認中…' : '接続して保存'}</button></div><p>Mirakurun / mirakc のサーバーアドレス</p>{message && <p role="status">{message}</p>}</form>}
    {screen === 'home' ? <Home message={message} busy={busy} onWatch={() => { setScreen('tv'); setUiVisible(true); setControlsVisible(true); setCursorVisible(true); }} /> : <TV selected={selected} services={visibleServices} broadcastType={broadcastType} onBroadcastType={setBroadcastType} message={message} busy={busy} canRefresh={Boolean(config.mirakcUrl)} onRefresh={() => void loadChannels()} onSelect={(service) => { setSelected(service); setMessage(`${service.name} に接続中…`); }} onHome={() => { setSelected(null); setScreen('home'); setMessage(''); setUiVisible(true); setControlsVisible(true); setCursorVisible(true); }} videoRef={videoRef} channelListRef={channelListRef} onPlaying={() => {
      if (playbackStartedRef.current) return;
      playbackStartedRef.current = true;
      setControlsVisible(false);
    }} />}

  </main>;
}
