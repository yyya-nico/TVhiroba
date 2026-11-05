type HomeProps = {
  message: string;
  busy: boolean;
  onWatch: () => void;
  onSettings: () => void;
  onInput?: () => void;
  sites?: readonly { id: string; name: string }[];
};

const demoSites = [
  { id: 'youtube', name: 'YouTube' },
  { id: 'netflix', name: 'Netflix' },
];

export default function Home({ message, busy, onWatch, onSettings, onInput, sites = demoSites }: HomeProps) {
  return <div className="home-content">
    <header className="home-header"><p>TVhiroba</p><h1>ホーム</h1></header>
    <nav className="home-grid" aria-label="アプリと入力">
      <button className="home-tile" onClick={onWatch}><strong>テレビ</strong><span>チャンネルを選ぶ</span></button>
      {onInput && <button className="home-tile" onClick={onInput}><strong>外部入力</strong><span>キャプチャーデバイスを表示</span></button>}
      {sites.map((site) => <button key={site.id} className="home-tile" disabled><strong>{site.name}</strong><span>準備中</span></button>)}
      <button className="home-tile" onClick={onSettings}><strong>設定</strong><span>接続先・外部入力を変更</span></button>
    </nav>
    <p className="home-status" role="status">{busy ? 'チャンネルと番組情報を取得中…' : message}</p>
  </div>;
}
