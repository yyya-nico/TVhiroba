import ExternalLinks from './ExternalLinksSetup';
import type { ExternalLink } from './externalLinks';
import type { FormEvent } from 'react';
import { InputSetup, type InputDevice } from './Input';

export type SetupView = 'loading' | 'welcome' | 'connection' | 'input' | 'links' | 'done';

type SetupProps = {
  setupView: Exclude<SetupView, 'done'>;
  externalLinks: ExternalLink[];
  onLinksComplete: (links: ExternalLink[]) => void;
  inputDevice: InputDevice | null;
  address: string;
  message: string;
  busy: boolean;
  onViewChange: (view: 'welcome' | 'connection') => void;
  onAddressChange: (address: string) => void;
  onSaveAddress: (event: FormEvent) => void;
  onInputComplete: (value: InputDevice | null) => void;
};

export default function Setup({ setupView, externalLinks, onLinksComplete, inputDevice, address, message, busy, onViewChange, onAddressChange, onSaveAddress, onInputComplete }: SetupProps) {
  return <main className="setup-shell">
    {setupView === 'loading' ? <div className="setup-loading" role="status">設定を読み込んでいます…</div> : <section className="setup-content">
      <div className="setup-copy">
        {setupView === 'links' ? <ExternalLinks initial={externalLinks} onComplete={onLinksComplete} /> : setupView === 'input' ? <InputSetup initial={inputDevice} onComplete={(value) => {
          onInputComplete(value);
        }} /> : setupView === 'welcome' ? <>
          <h1>TVhirobaへようこそ</h1>
          <p className="setup-lead">いつものテレビ環境につないで、ブラウザから視聴を始めましょう。</p>
          <p className="setup-description">まずはMirakurun / mirakcのアドレスを登録します。接続先はあとから設定で変更できます。</p>
          <button className="setup-primary" onClick={() => { onViewChange('connection'); }}>セットアップを始める <span aria-hidden="true">→</span></button>
        </> : <>
          <button className="setup-back" type="button" onClick={() => { onViewChange('welcome'); }}>← はじめに戻る</button>
          <h1>テレビサーバーに接続</h1>
          <p className="setup-lead">Mirakurunまたはmirakcのアドレスを入力してください。</p>
          <form className="setup-form" onSubmit={onSaveAddress}>
            <label htmlFor="setup-mirakc-url">サーバーアドレス</label>
            <input id="setup-mirakc-url" type="url" placeholder="http://192.168.1.10:40772" value={address} onChange={(e) => onAddressChange(e.target.value)} required autoFocus />
            <p>例: http://mirakc-host:40772</p>
            {message && <div className="setup-message" role="status">{message}</div>}
            <button className="setup-primary" disabled={busy}>{busy ? '接続を確認中…' : '接続して次へ'} <span aria-hidden="true">→</span></button>
          </form>
        </>}
      </div>
    </section>}
  </main>;
}
