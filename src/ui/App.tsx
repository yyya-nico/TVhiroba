import { useEffect, useRef, useState } from 'react';
import { Mpeg2TsPlayer } from '../../vendor/mpeg2toh264-player/src/index.js';

type TvProgram = { id?: number; name?: string; description?: string; startAt: number; duration: number };
type TvService = { id: number; serviceId: number; networkId?: number; remoteControlKeyId?: number; name: string; type?: number; channelType: string; isSubchannel: boolean; currentProgram: TvProgram | null; nextProgram: TvProgram | null };
type TvChannel = { type: string; channel: string; name: string; services: TvService[] };
type ChannelResponse = { channels: TvChannel[]; programGuideAvailable: boolean; serviceCount: number; servicesWithGuide: number; generatedAt: number };
type Config = { mirakcUrl: string };
type SetupView = 'loading' | 'welcome' | 'connection' | 'done';
type Band = 'GR' | 'BS' | 'CS';
const bandNames: Record<Band, string> = { GR: '地デジ', BS: 'BS', CS: 'CS' };
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
  const [selected, setSelected] = useState<TvService | null>(null);
  const [message, setMessage] = useState('接続先を設定してください');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [band, setBand] = useState<Band>('GR');
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const [setupView, setSetupView] = useState<SetupView>('loading');
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Mpeg2TsPlayer | null>(null);

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
  }, [selected?.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function loadChannels() {
    setBusy(true); setMessage('チャンネルと番組情報を取得中…');
    try {
      const data = await json<ChannelResponse>('/api/tvhiroba/channels');
      setChannels(data.channels);
      setSelected((current) => current ? data.channels.flatMap((channel) => channel.services).find((service) => service.id === current.id) ?? null : null);
      setMessage(data.serviceCount ? '' : '受信できるチャンネルがありません');
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
  const services = [...new Map(channels.flatMap((channel) => channel.services).map((service) => [service.id, service])).values()];
  const bandServices = services.filter((service) => service.channelType.toUpperCase() === band && Boolean(service.currentProgram?.name?.trim()))
    .sort((a, b) => (a.remoteControlKeyId || 999) - (b.remoteControlKeyId || 999) || a.serviceId - b.serviceId || a.id - b.id);
  const assignments = new Map<number, TvService>();
  for (const service of bandServices.filter((service) => !service.isSubchannel)) {
    const key = service.remoteControlKeyId;
    if (key && key <= 12 && !assignments.has(key)) assignments.set(key, service);
  }
  function tune(service: TvService) {
    setNotice('');
    if (selected?.id === service.id) return;
    setMessage(`${service.name} に接続中…`);
    setSelected(service);
  }
  function selectNumber(number: number) {
    const service = assignments.get(number);
    if (service) tune(service);
    else setNotice(`${bandNames[band]}の${number}にはチャンネルがありません`);
  }
  function stepChannel(direction: number) {
    if (!bandServices.length) { setNotice(`${bandNames[band]}にはチャンネルがありません`); return; }
    const index = bandServices.findIndex((service) => service.id === selected?.id);
    tune(bandServices[index < 0 ? (direction > 0 ? 0 : bandServices.length - 1) : (index + direction + bandServices.length) % bandServices.length]);
  }
  function switchBand(next: Band) {
    setBand(next);
    setNotice(`${bandNames[next]}：数字ボタンで選局してください`);
  }

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

  return <main className="app-shell">
    <div className="player-frame">{selected ? <video ref={videoRef} autoPlay playsInline /> : <div className="player-placeholder"><p>リモコンでチャンネルを選んでください</p></div>}</div>
    <section className="now-playing" aria-label="現在の放送" aria-live="polite">
      <h1>{selected?.name ?? 'チャンネル未選択'}</h1>
      <p className="watching-title">{selected ? selected.currentProgram?.name ?? '番組情報なし' : '地デジ・BS・CS'}</p>
    </section>
    {(notice || message) && <div className="viewer-message" role="status">{notice || message}</div>}
    <div className="viewer-actions">
      <button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="接続設定" aria-expanded={settingsOpen}>⚙</button>
      <button className="remote-toggle" onClick={() => setRemoteOpen(!remoteOpen)} aria-expanded={remoteOpen} aria-controls="tv-remote">リモコン</button>
    </div>
    {settingsOpen && <form className="settings-panel" onSubmit={saveAddress}><div className="settings-title"><label htmlFor="mirakc-url">テレビサーバーの接続設定</label><button type="button" className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる">×</button></div><div className="settings-row"><input id="mirakc-url" type="url" placeholder="http://192.168.1.10:40772" value={address} onChange={(e) => setAddress(e.target.value)} required /><button disabled={busy}>{busy ? '確認中…' : '接続して保存'}</button></div><p>Mirakurun / mirakc のサーバーアドレス</p><button type="button" className="refresh-button" disabled={!config.mirakcUrl || busy} onClick={() => void loadChannels()}>チャンネル情報を更新</button>{message && <p role="status">{message}</p>}</form>}
    {remoteOpen && <section id="tv-remote" className="tv-remote" aria-label="テレビリモコン">
      <div className="remote-heading"><span>TVHIROBA</span><button onClick={() => setRemoteOpen(false)} aria-label="リモコンを閉じる">×</button></div>
      <div className="remote-bands">{(['GR', 'BS', 'CS'] as const).map((type) => <button key={type} aria-pressed={band === type} onClick={() => switchBand(type)}>{bandNames[type]}</button>)}</div>
      <div className="remote-numbers">{Array.from({ length: 12 }, (_, index) => index + 1).map((number) => <button key={`${band}-${number}`} aria-label={`${bandNames[band]} ${number}${assignments.get(number) ? ` ${assignments.get(number)!.name}` : ' チャンネルなし'}`} aria-pressed={selected !== null && selected.channelType.toUpperCase() === band && assignments.get(number)?.id === selected.id} onClick={() => selectNumber(number)}>{number}</button>)}</div>
      <div className="remote-channel"><span>チャンネル</span><button onClick={() => stepChannel(1)} aria-label="チャンネルを上げる">∧</button><button onClick={() => stepChannel(-1)} aria-label="チャンネルを下げる">∨</button></div>
      <p className="remote-band-status">{bandNames[band]}{selected && selected.channelType.toUpperCase() !== band ? '：選局待ち' : ''}</p>
    </section>}
  </main>;
}
