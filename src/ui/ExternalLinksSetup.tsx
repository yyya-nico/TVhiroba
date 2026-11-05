import { useState, type FormEvent } from 'react';
import { normalizeExternalUrl, saveExternalLinks, type ExternalLink } from './externalLinks';

export default function ExternalLinks({ initial, onComplete, mode = 'setup' }: { initial: ExternalLink[]; onComplete: (links: ExternalLink[]) => void; mode?: 'setup' | 'settings' }) {
  const [links, setLinks] = useState(initial);
  const [message, setMessage] = useState('');
  function complete(value: ExternalLink[]) {
    try {
      const normalized = value.map((link) => ({ ...link, name: link.name.trim(), url: normalizeExternalUrl(link.url) }));
      if (normalized.some((link) => !link.name)) throw new Error('リンク名を入力してください。');
      saveExternalLinks(normalized);
      setLinks(normalized);
      onComplete(normalized);
      setMessage('外部リンクの設定を保存しました。');
    } catch (error) { setMessage(error instanceof TypeError ? '有効なURLを入力してください。' : error instanceof Error ? error.message : '設定を保存できませんでした。'); }
  }
  function submit(event: FormEvent) { event.preventDefault(); complete(links); }
  function update(id: string, value: Partial<ExternalLink>) { setLinks((current) => current.map((link) => link.id === id ? { ...link, ...value } : link)); setMessage(''); }
  return <>
    {mode === 'settings' ? <h2>外部リンク</h2> : <h1>外部リンクを設定</h1>}
    <p className="setup-lead">ホームから開くWebサイトを登録します。</p>
    <p className="setup-description">リンクごとに同じタブか新しいタブかを選べます。{mode === 'setup' ? '使わない場合はスキップできます。あとから設定で追加・変更できます。' : 'リンクは何個でも登録でき、すべて削除することもできます。'}</p>
    <form className="external-links-form" onSubmit={submit}>
      {links.map((link, index) => <fieldset key={link.id} className="external-link-fields">
        <legend>リンク {index + 1}</legend>
        <label htmlFor={`link-name-${link.id}`}>リンク名</label>
        <input id={`link-name-${link.id}`} value={link.name} onChange={(event) => update(link.id, { name: event.target.value })} required />
        <label htmlFor={`link-url-${link.id}`}>URL</label>
        <input id={`link-url-${link.id}`} type="url" placeholder="https://example.com" value={link.url} onChange={(event) => update(link.id, { url: event.target.value })} required />
        <label className="external-link-target" htmlFor={`link-target-${link.id}`}>
          <input id={`link-target-${link.id}`} type="checkbox" checked={link.newTab} onChange={(event) => update(link.id, { newTab: event.target.checked })} />
          新しいタブで開く
        </label>
        <button type="button" className="setup-secondary" onClick={() => { setLinks((current) => current.filter((item) => item.id !== link.id)); setMessage(''); }}>リンク {index + 1} を削除</button>
      </fieldset>)}
      <button type="button" className="setup-secondary" onClick={() => { setLinks((current) => [...current, { id: crypto.randomUUID(), name: '', url: '', newTab: false }]); setMessage(''); }}>リンクを追加</button>
      {message && <p className="setup-message" role="status">{message}</p>}
      <button className="setup-primary" type="submit">{mode === 'settings' ? '外部リンクを保存' : '保存して完了'}</button>
    </form>
    {mode === 'setup' && <button type="button" className="setup-back" onClick={() => complete([])}>外部リンクを使わずに完了</button>}
  </>;
}
