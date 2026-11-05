import type { RefObject } from 'react';
import type { TvService } from './App';

type TVProps = {
  selected: TvService | null;
  services: TvService[];
  broadcastType: string;
  onBroadcastType: (type: string) => void;
  message: string;
  busy: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  onSelect: (service: TvService) => void;
  onHome: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  channelListRef: RefObject<HTMLDivElement>;
  onPlaying: () => void;
};

export default function TV({ selected, services, broadcastType, onBroadcastType, message, busy, canRefresh, onRefresh, onSelect, onHome, videoRef, channelListRef, onPlaying }: TVProps) {
  const broadcastTypes = Array.from(new Set(['GR', 'BS', 'CS', ...services.map((service) => service.channelType.toUpperCase())]));
  const broadcastLabels: Record<string, string> = { GR: '地デジ', BS: 'BS', CS: 'CS', SKY: 'スカパー！', BS4K: 'BS4K' };
  const displayedServices = services.filter((service) => service.channelType.toUpperCase() === broadcastType);
  const formatTime = (timestamp: number) => new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(timestamp);

  return <>
    <div className="player-frame">{selected && <video ref={videoRef} autoPlay playsInline onPlaying={onPlaying} />}</div>
    <header className="now-playing"><div><h1>{selected?.name ?? 'チャンネルを選択'}</h1>{selected?.currentProgram && <p className="watching-title">{selected.currentProgram.name}</p>}</div><span className="status-message" role="status">{message}</span></header>
    <button className="home-back" onClick={onHome}>← ホーム</button>
    <section className="viewer-overlay" aria-label="テレビの選局">
      <div className="list-heading"><h2>チャンネル <span>{services.length}</span></h2><div className="channel-actions"><button className="icon-button" onClick={onRefresh} disabled={!canRefresh || busy} aria-label="一覧を更新">↻</button></div></div>
      <div className="broadcast-types" role="group" aria-label="放送種別">{broadcastTypes.map((type) => <button key={type} type="button" aria-pressed={broadcastType === type} onClick={() => { onBroadcastType(type); channelListRef.current?.scrollTo({ top: 0 }); }}>{broadcastLabels[type] ?? type}</button>)}</div>
      {busy && services.length === 0 ? <div className="empty-state">チャンネルと番組情報を読み込み中…</div> : displayedServices.length === 0 ? <div className="empty-state">この放送種別には現在の番組情報があるサービスがありません。</div> : <div className="channel-list" ref={channelListRef}>{displayedServices.map((service) => <button key={service.id} className={`program-service ${selected?.id === service.id ? 'selected' : ''}`} aria-pressed={selected?.id === service.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })} onClick={() => onSelect(service)}>
          <span className="service-name-line"><strong>{service.name}</strong><span className="service-id">{selected?.id === service.id ? '視聴中' : service.channelType}</span></span>
          <span className="current-program"><strong>{service.currentProgram?.name ?? '番組情報なし'}</strong>
            {service.currentProgram && <span className="program-time">{formatTime(service.currentProgram.startAt)} – {formatTime(service.currentProgram.startAt + service.currentProgram.duration)}</span>}
          </span>
          <span className="next-program"><span className="program-label">次</span><span>{service.nextProgram?.name ?? '番組情報なし'}</span></span>
        </button>)}</div>}
    </section>
  </>;
}
