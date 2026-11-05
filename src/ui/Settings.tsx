import type { FormEvent } from 'react';
import { InputSetup, type InputDevice } from './Input';

type SettingsProps = {
  address: string;
  message: string;
  busy: boolean;
  inputDevice: InputDevice | null;
  onAddressChange: (address: string) => void;
  onSaveAddress: (event: FormEvent) => void;
  onClose: () => void;
  onInputComplete: (value: InputDevice | null) => void;
};

export default function Settings({ address, message, busy, inputDevice, onAddressChange, onSaveAddress, onClose, onInputComplete }: SettingsProps) {
  return <main className="settings-shell">
    <div className="settings-content">
      <header className="settings-header">
        <button type="button" className="setup-back" onClick={onClose}>← ホームに戻る</button>
        <h1>設定</h1>
      </header>
      <section className="settings-section" aria-labelledby="server-settings-title">
        <h2 id="server-settings-title">テレビサーバー</h2>
        <p className="setup-lead">Mirakurun / mirakc の接続先を設定します。</p>
        <form className="setup-form" onSubmit={onSaveAddress}>
          <label htmlFor="mirakc-url">サーバーアドレス</label>
          <div className="settings-row">
            <input id="mirakc-url" type="url" placeholder="http://192.168.1.10:40772" value={address} onChange={(e) => onAddressChange(e.target.value)} required />
            <button disabled={busy}>{busy ? '確認中…' : '接続して保存'}</button>
          </div>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
      <section className="settings-section" aria-label="外部入力の設定">
        <InputSetup initial={inputDevice} onComplete={onInputComplete} mode="settings" />
      </section>
    </div>
  </main>;
}
