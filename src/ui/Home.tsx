type HomeProps = {
  message: string;
  busy: boolean;
  onWatch: () => void;
  sites?: readonly { id: string; name: string }[];
};

const demoSites = [
  { id: 'youtube', name: 'YouTube' },
  { id: 'netflix', name: 'Netflix' },
];

export default function Home({ message, busy, onWatch, sites = demoSites }: HomeProps) {
  return <div className="home-content">
    <header className="home-header"><p>TVhiroba</p><h1>ホーム</h1></header>
    <nav className="home-grid" aria-label="アプリと入力">
      <button className="home-tile" onClick={onWatch}><strong>テレビ</strong><span>チャンネルを選ぶ</span></button>
      <button className="home-tile" disabled><strong>外部入力</strong><span>準備中</span></button>
      {sites.map((site) => <button key={site.id} className="home-tile" disabled><strong>{site.name}</strong><span>準備中</span></button>)}
    </nav>
    <p className="home-status" role="status">{busy ? 'チャンネルと番組情報を取得中…' : message}</p>
  </div>;
}
