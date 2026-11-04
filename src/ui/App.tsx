import { useEffect, useRef, useState } from 'react';
import { Mpeg2TsPlayer } from '../../vendor/mpeg2toh264-player/src/index.js';

type TvProgram = { id?: number; name?: string; description?: string; startAt: number; duration: number };
type TvService = { id: number; serviceId: number; networkId?: number; remoteControlKeyId?: number; name: string; type?: number; channelType: string; isSubchannel: boolean; currentProgram: TvProgram | null; nextProgram: TvProgram | null };
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

// Use actual card positions so wheel navigation and arrows also work on narrow screens.
function scrollChannel(list: HTMLDivElement | null, direction: number) {
  if (!list) return;
  const listLeft = list.getBoundingClientRect().left + list.clientLeft;
  const padding = parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0;
  const max = list.scrollWidth - list.clientWidth;
  const positions = Array.from(list.children, (card) => Math.max(0, Math.min(max,
    card.getBoundingClientRect().left - listLeft + list.scrollLeft - padding)));
  const target = direction > 0
    ? positions.find((position) => position > list.scrollLeft + 2)
    : positions.reverse().find((position) => position < list.scrollLeft - 2);
  if (target !== undefined) list.scrollTo({ left: target, behavior: 'smooth' });
}

export default function App() {
  const [config, setConfig] = useState<Config>({ mirakcUrl: '' });
  const [address, setAddress] = useState('http://localhost:40772');
  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [selected, setSelected] = useState<TvService | null>(null);
  const [message, setMessage] = useState('接続先を設定してください');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
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
    if (setupView !== 'done' || !selected || settingsOpen || message) return;
    let timer: ReturnType<typeof setTimeout>;
    const showUi = () => {
      setUiVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setUiVisible(false), 4000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focusin'] as const;
    events.forEach((event) => window.addEventListener(event, showUi, { passive: true }));
    showUi();
    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, showUi));
    };
  }, [setupView, selected, settingsOpen, message]);

  useEffect(() => {
    const list = channelListRef.current;
    if (!list) return;
    let accumulated = 0;
    let lastEventAt = -Infinity;
    let lastStepAt = -Infinity;
    const scrollHorizontally = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        || list.scrollWidth <= list.clientWidth) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastEventAt > 180) accumulated = 0;
      lastEventAt = now;
      // Discard input during the animation rather than queueing extra steps.
      if (now - lastStepAt < 300) {
        accumulated = 0;
        return;
      }
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? list.clientWidth : 1;
      const delta = event.deltaY * unit;
      if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
      accumulated += delta;
      if (Math.abs(accumulated) < 40) return;
      scrollChannel(list, Math.sign(accumulated));
      accumulated = 0;
      lastStepAt = now;
    };
    list.addEventListener('wheel', scrollHorizontally, { passive: false });
    return () => list.removeEventListener('wheel', scrollHorizontally);
  }, [setupView, channels]);

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
  const formatTime = (timestamp: number) => new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(timestamp);

  if (setupView !== 'done') return <main className="setup-shell">
    {setupView === 'loading' ? <div className="setup-loading" role="status">設定を読み込んでいます…</div> : <section className="setup-content">
      <div className="setup-copy">
        <p className="eyebrow">WELCOME TO TVHIROBA</p>
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

  return <main className={`app-shell${uiVisible ? '' : ' ui-hidden'}`}>
    <div className="player-frame">{selected ? <video ref={videoRef} autoPlay playsInline /> : <div className="player-placeholder"><p className="eyebrow">TVHIROBA</p><h1>今日は、何を見よう。</h1><p>下のチャンネルから選んで視聴を始めましょう。</p></div>}</div>
    <div className="viewer-actions"><button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="接続設定" aria-expanded={settingsOpen}>⚙</button></div>
    {settingsOpen && <form className="settings-panel" onSubmit={saveAddress}><div className="settings-title"><label htmlFor="mirakc-url">テレビサーバーの接続設定</label><button type="button" className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる">×</button></div><div className="settings-row"><input id="mirakc-url" type="url" placeholder="http://192.168.1.10:40772" value={address} onChange={(e) => setAddress(e.target.value)} required /><button disabled={busy}>{busy ? '確認中…' : '接続して保存'}</button></div><p>Mirakurun / mirakc のサーバーアドレス</p>{message && <p role="status">{message}</p>}</form>}
    <section className="viewer-overlay" aria-label="テレビの選局">
      <div className="now-playing"><div><p className="eyebrow">{selected ? '放送中' : 'LIVE TELEVISION'}</p><h1>{selected?.name ?? 'チャンネルを選択'}</h1>{selected?.currentProgram && <p className="watching-title">{selected.currentProgram.name}</p>}</div><span className="status-message" role="status">{message}</span></div>
      <div className="list-heading"><h2>チャンネル <span>{visibleServices.length}</span></h2><div className="channel-actions"><button className="icon-button" onClick={() => void loadChannels()} disabled={!config.mirakcUrl || busy} aria-label="一覧を更新">↻</button><button className="icon-button" aria-label="前のチャンネルを表示" onClick={() => scrollChannel(channelListRef.current, -1)}>←</button><button className="icon-button" aria-label="次のチャンネルを表示" onClick={() => scrollChannel(channelListRef.current, 1)}>→</button></div></div>
      {busy && channels.length === 0 ? <div className="empty-state">チャンネルと番組情報を読み込み中…</div> : visibleServices.length === 0 ? <div className="empty-state">現在の番組情報があるサービスがありません。一覧を更新してください。</div> : <div className="channel-list" ref={channelListRef}>{visibleServices.map((service) => <button key={service.id} className={`program-service ${selected?.id === service.id ? 'selected' : ''}`} aria-pressed={selected?.id === service.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })} onClick={() => { setSelected(service); setMessage(`${service.name} に接続中…`); }}>
          <span className="service-name-line"><strong>{service.name}</strong><span className="service-id">{selected?.id === service.id ? '視聴中' : service.channelType}</span></span>
          <span className="current-program"><strong>{service.currentProgram?.name ?? '番組情報なし'}</strong>
            {service.currentProgram && <span className="program-time">{formatTime(service.currentProgram.startAt)} – {formatTime(service.currentProgram.startAt + service.currentProgram.duration)}</span>}
          </span>
          <span className="next-program"><span className="program-label">次</span><span>{service.nextProgram?.name ?? '番組情報なし'}</span></span>
        </button>)}</div>}
    </section>
  </main>;
}
