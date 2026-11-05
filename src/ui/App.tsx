import { useAutoHideControls } from './useAutoHideControls';
import { useEffect, useState, type ReactNode } from 'react';
import Home from './Home';
import TV, { type TvService } from './TV';
import Input, { readInputDevice, type InputDevice } from './Input';
import Setup, { type SetupView } from './Setup';
import Settings from './Settings';
import { setupDestination, setupUrl, useRoute } from './routing';

type TvChannel = { type: string; channel: string; name: string; services: TvService[] };
type ChannelResponse = { channels: TvChannel[]; programGuideAvailable: boolean; serviceCount: number; servicesWithGuide: number; generatedAt: number };
type Config = { mirakcUrl: string };
const hasCurrentProgram = (service: TvService) => Boolean(service.currentProgram?.name?.trim());
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body as T;
}

export default function App() {
  const [inputDevice, setInputDevice] = useState<InputDevice | null>(() => readInputDevice() ?? null);
  const [config, setConfig] = useState<Config>({ mirakcUrl: '' });
  const [address, setAddress] = useState('http://localhost:40772');
  const [channels, setChannels] = useState<TvChannel[]>([]);
  const { path, pathname, search, navigate } = useRoute();
  const [configLoaded, setConfigLoaded] = useState(false);
  const [inputConfigured, setInputConfigured] = useState(() => readInputDevice() !== undefined);
  const screen = path === '/tv' ? 'tv' : path === '/input' ? 'input' : path === '/settings' ? 'settings' : 'home';
  const inSetup = path.startsWith('/setup');
  const next = inSetup ? setupDestination(search) : path;
  const [message, setMessage] = useState('接続先を設定してください');
  const [busy, setBusy] = useState(false);
  const setupView: SetupView = !configLoaded ? 'loading' : path === '/setup/input' ? 'input' : path === '/setup/connection' ? 'connection' : 'welcome';

  useEffect(() => {
    if (!configLoaded) return;
    if (pathname !== path) { navigate(path, true); return; }
    if (!config.mirakcUrl) {
      if (!inSetup || path === '/setup/input') navigate(setupUrl('/setup', next), true);
    } else if (!inputConfigured) {
      if (path !== '/setup/input') navigate(setupUrl('/setup/input', next), true);
    } else if (inSetup) {
      navigate(next, true);
    } else if (path === '/input' && !inputDevice) {
      navigate('/settings', true);
    }
  }, [configLoaded, config.mirakcUrl, inputConfigured, inputDevice, path, pathname, search]);

  useEffect(() => { void json<Config>('/api/config').then((value) => { setConfig(value); if (value.mirakcUrl) { setAddress(value.mirakcUrl); void loadChannels(); } }).catch((e) => { setMessage(e.message); }).finally(() => setConfigLoaded(true)); }, []);
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
      setConfig({ mirakcUrl: value.mirakcUrl }); setAddress(value.mirakcUrl); if (inSetup) navigate(setupUrl('/setup/input', next), true);
      setMessage(`mirakcに接続しました${value.version?.current ? ` (${value.version.current})` : ''}`); await loadChannels();
    } catch (error) { setMessage(error instanceof Error ? error.message : '接続できませんでした'); }
    finally { setBusy(false); }
  }

  if (!configLoaded || inSetup || !config.mirakcUrl || !inputConfigured) return <Setup setupView={setupView} inputDevice={inputDevice} address={address} message={message} busy={busy} onViewChange={(view) => { setMessage(''); navigate(setupUrl(view === 'connection' ? '/setup/connection' : '/setup', next)); }} onAddressChange={setAddress} onSaveAddress={saveAddress} onInputComplete={(value) => {
    setInputDevice(value); setInputConfigured(true); navigate(next, true); setMessage('');
  }} />;

  if (screen === 'settings') return <Settings address={address} message={message} busy={busy} inputDevice={inputDevice} onAddressChange={setAddress} onSaveAddress={saveAddress} onClose={() => { navigate('/'); setMessage(''); }} onInputComplete={setInputDevice} />;

  const openSettings = () => { setMessage(''); navigate('/settings'); };
  const goHome = () => { navigate('/'); setMessage(''); };

  if (screen === 'tv') return <TV services={channels.flatMap((channel) => channel.services)} message={message} onMessage={setMessage} busy={busy} canRefresh={Boolean(config.mirakcUrl)} onRefresh={() => void loadChannels()} onHome={goHome} Shell={AppShell} />;

  return <AppShell home={screen === 'home'} autoHideTitle={screen === 'input'}>
    {screen === 'input' && inputDevice
      ? <Input device={inputDevice} onHome={goHome} />
      : <Home onSettings={openSettings} onInput={inputDevice ? () => navigate('/input') : undefined} message={message} busy={busy} onWatch={() => navigate('/tv')} />}
  </AppShell>;
}

export type AppShellProps = {
  children: ReactNode;
  home?: boolean;
  autoHideTitle?: boolean;
  controlsVisible?: boolean;
  onToggle?: () => void;
};

function AppShell({ children, home = false, autoHideTitle = false, controlsVisible, onToggle }: AppShellProps) {
  const [activityVisible, setActivityVisible] = useState(true);
  const [localControlsVisible, setLocalControlsVisible] = useAutoHideControls(autoHideTitle && controlsVisible === undefined);

  useEffect(() => {
    setActivityVisible(true);
    if (!autoHideTitle) return;
    let timer: ReturnType<typeof setTimeout>;
    const showActivity = () => {
      setActivityVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActivityVisible(false), 4000);
    };
    const showOnMouseMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') showActivity();
    };
    showActivity();
    window.addEventListener('pointermove', showOnMouseMove, { passive: true });
    window.addEventListener('click', showActivity);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', showOnMouseMove);
      window.removeEventListener('click', showActivity);
    };
  }, [autoHideTitle]);

  const uiVisible = !autoHideTitle || activityVisible;
  const buttonsVisible = !autoHideTitle || (controlsVisible ?? localControlsVisible);

  return <main className={`app-shell${home ? ' home-shell' : ''}${uiVisible ? '' : ' ui-hidden'}${buttonsVisible ? '' : ' controls-hidden'}${uiVisible ? '' : ' cursor-hidden'}`} onClick={(event) => {
    if (event.target instanceof Element && event.target.closest('button, input, textarea, select, label')) return;
    if (onToggle) onToggle();
    else if (autoHideTitle) setLocalControlsVisible((visible) => !visible);
  }}>
    {children}
  </main>;
}
