import type { ExternalLink } from './externalLinks';
type HomeProps = {
  message: string;
  busy: boolean;
  onWatch: () => void;
  onSettings: () => void;
  onInput?: () => void;
  sites?: readonly ExternalLink[];
};

export default function Home({ message, busy, onWatch, onSettings, onInput, sites = [] }: HomeProps) {
  return <div className="home-content">
    <header className="home-header"><p>TVhiroba</p><h1>ホーム</h1></header>
    <nav className="home-grid" aria-label="アプリと入力">
      <button className="home-tile" onClick={onWatch}><strong>テレビ</strong><span>チャンネルを選ぶ</span></button>
      {onInput && <button className="home-tile" onClick={onInput}><strong>外部入力</strong><span>キャプチャーデバイスを表示</span></button>}
      {sites.map((site) => <a key={site.id} className="home-tile" href={site.url} target={site.newTab ? '_blank' : '_self'} rel={site.newTab ? 'noopener noreferrer' : undefined}><strong>{site.name}</strong><span>{site.newTab ? '新しいタブで開く ↗' : ''}</span></a>)}
      <button className="home-tile" onClick={onSettings}><strong>設定</strong><span>接続先・外部入力・外部リンクを変更</span></button>
    </nav>
    <p className="home-status" role="status">{busy ? 'チャンネルと番組情報を取得中…' : message}</p>
  </div>;
}
