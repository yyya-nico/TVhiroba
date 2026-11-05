import { useEffect, useRef, useState } from 'react';

export type InputDevice = { videoId: string; audioId: string };
const storageKey = 'tvhiroba.input';
export function readInputDevice(): InputDevice | null | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return undefined;
    const value = JSON.parse(raw);
    return value && typeof value.videoId === 'string' && value.videoId && typeof value.audioId === 'string' ? value : null;
  } catch { return undefined; }
}
export function saveInputDevice(value: InputDevice | null) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}
function describe(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  const messages: Record<string, string> = {
    NotAllowedError: 'アクセスが許可されませんでした。ブラウザのカメラ・マイク設定を確認するか、スキップしてください。',
    NotFoundError: '入力デバイスが見つかりません。接続を確認してください。',
    NotReadableError: 'デバイスを開けません。他のアプリで使用していないか確認してください。',
    OverconstrainedError: '選択したデバイスを利用できません。設定から選び直してください。',
  };
  return messages[name] ?? (error instanceof Error ? error.message : '外部入力を開始できませんでした。');
}
function mediaDevices() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('外部入力は対応ブラウザのHTTPSまたはlocalhostで利用してください。');
  return navigator.mediaDevices;
}

export function InputSetup({ initial, onComplete, mode = 'setup' }: { initial: InputDevice | null; onComplete: (value: InputDevice | null) => void; mode?: 'setup' | 'settings' }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoId, setVideoId] = useState(initial?.videoId ?? '');
  const [audioId, setAudioId] = useState(initial?.audioId ?? '');
  const [allowed, setAllowed] = useState(false);
  const [audioAllowed, setAudioAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      void (async () => {
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          // Permission queries are unavailable in some browsers; exposed video
          // labels let us recognize existing access without opening the camera.
          let granted = list.some((device) => device.kind === 'videoinput' && !!device.label);
          let microphoneGranted = list.some((device) => device.kind === 'audioinput' && !!device.label);
          try {
            const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
            granted = permission.state === 'granted';
          } catch { /* Use the device labels when camera queries are unsupported. */ }
          try {
            const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            microphoneGranted = permission.state === 'granted';
          } catch { /* Use the device labels when microphone queries are unsupported. */ }
          if (mounted.current) { setDevices(list); setAllowed(granted); setAudioAllowed(microphoneGranted); }
        } catch { /* Keep the permission request available when detection fails. */ }
      })();
    };
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => { mounted.current = false; navigator.mediaDevices?.removeEventListener('devicechange', refresh); };
  }, []);
  async function requestPermission() {
    setBusy(true); setMessage('');
    try {
      const media = mediaDevices();
      const stream = await media.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      // Audio permission is optional so video-only capture devices also work.
      let microphoneGranted = false;
      try {
        const audio = await media.getUserMedia({ audio: true });
        audio.getTracks().forEach((track) => track.stop());
        microphoneGranted = true;
      } catch { if (mounted.current) setMessage('音声の権限がない場合も、映像のみで利用できます。'); }
      const list = await media.enumerateDevices();
      if (!mounted.current) return;
      setDevices(list); setAllowed(true); setAudioAllowed(microphoneGranted);
      if (!list.some((device) => device.kind === 'videoinput')) setMessage('映像入力が見つかりません。接続を確認してください。');
    } catch (error) { if (mounted.current) setMessage(describe(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  function complete(value: InputDevice | null) {
    try { saveInputDevice(value); onComplete(value); if (mode === 'settings') setMessage(value ? '外部入力の設定を保存しました。' : '外部入力を無効にしました。'); }
    catch { setMessage('設定を保存できませんでした。ブラウザのストレージ設定を確認してください。'); }
  }
  const validVideo = devices.some((device) => device.kind === 'videoinput' && device.deviceId === videoId);
  const validAudio = !audioId || devices.some((device) => device.kind === 'audioinput' && device.deviceId === audioId);
  return <>
    {mode === 'settings' ? <h2>外部入力</h2> : <h1>外部入力を設定</h1>}
    <p className="setup-lead">UVCキャプチャーデバイスの映像と音声を選びます。</p>
    <p className="setup-description">{!allowed && 'ブラウザに表示されるカメラ・マイクへのアクセスを許可してください。'}{mode === 'settings' ? '映像入力と音声入力を選んで保存してください。' : '外部入力を使わない場合はスキップできます。'}</p>
    {allowed ? <p className="input-permission-granted" role="status">{audioAllowed ? 'カメラ・マイクへのアクセスは許可済みです。' : 'カメラへのアクセスは許可済みです。音声は許可済みの場合に選択できます。'}</p> : <button type="button" className="setup-primary" disabled={busy} onClick={() => void requestPermission()}>{busy ? '確認中…' : '権限を要求してデバイスを探す'}</button>}
    {allowed && <div className="input-fields">
      <label htmlFor="input-video">映像入力</label>
      <select id="input-video" value={validVideo ? videoId : ''} onChange={(event) => setVideoId(event.target.value)}><option value="">選択しない</option>{devices.filter((device) => device.kind === 'videoinput' && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `映像入力 ${index + 1}`}</option>)}</select>
      <label htmlFor="input-audio">音声入力</label>
      <select id="input-audio" value={validAudio ? audioId : ''} onChange={(event) => setAudioId(event.target.value)}><option value="">音声なし</option>{devices.filter((device) => device.kind === 'audioinput' && device.deviceId && device.label).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `音声入力 ${index + 1}`}</option>)}</select>
      <button type="button" className="setup-primary" disabled={busy || !validVideo || !validAudio} onClick={() => complete({ videoId, audioId })}>{mode === 'settings' ? '外部入力を保存' : '保存して完了'}</button>
    </div>}
    {message && <p className="setup-message" role="status">{message}</p>}
    <button type="button" className="setup-back" onClick={() => complete(null)}>{mode === 'settings' ? '外部入力を無効にする' : '外部入力を使わずに完了'}</button>
  </>;
}

export default function Input({ device, onHome }: { device: InputDevice; onHome: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('外部入力を開始しています…');
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    const video = videoRef.current;
    const stop = () => { stream?.getTracks().forEach((track) => track.stop()); if (video) video.srcObject = null; };
    setPlaying(false); setMessage('外部入力を開始しています…');
    void (async () => {
      try {
        stream = await mediaDevices().getUserMedia({
          video: { deviceId: { exact: device.videoId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: device.audioId ? { deviceId: { exact: device.audioId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } : false,
        });
        if (disposed || !video) { stop(); return; }
        stream.getTracks().forEach((track) => track.addEventListener('ended', () => {
          if (disposed) return;
          stop(); setPlaying(false); setMessage('入力が切断されました。接続を確認して再試行してください。');
        }));
        video.srcObject = stream;
        await video.play();
        if (!disposed) { setPlaying(true); setMessage(''); }
      } catch (error) { stop(); if (!disposed) setMessage(describe(error)); }
    })();
    window.addEventListener('pagehide', stop);
    return () => { disposed = true; stop(); window.removeEventListener('pagehide', stop); };
  }, [device, attempt]);
  return <>
    <div className="player-frame"><video ref={videoRef} autoPlay playsInline /></div>
    <header className="now-playing"><h1>外部入力</h1><span className="status-message" role="status">{message}</span></header>
    <button className="home-back" onClick={onHome}>← ホーム</button>
    {!playing && <section className="viewer-overlay" aria-label="外部入力の操作"><p>{message}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>再試行</button></section>}
  </>;
}
