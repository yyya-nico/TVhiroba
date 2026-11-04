# TVhiroba

ブラウザからmirakc / Mirakurun互換サーバーを設定し、サービスを選んでライブ映像を再生するための最小アプリです。日本の放送TSに含まれるMPEG-2 Videoは、ブラウザ内のmpeg2toh264 Worker/WASMでH.264へ変換して再生します。

## 起動

Node.js 20以降を用意して、プロジェクト直下で実行します。

```sh
npm install
npm run dev
```

開発時は `http://localhost:5173` を開きます。Viteが画面を配信し、APIは同じPCのNode.jsサーバー（ポート4174）へ中継します。

本番向けには `npm run build` のあと `npm start` を実行します。Node.jsサーバーが `dist` の画面とAPIを `http://localhost:4174` で配信します。

画面右上の設定からmirakcのベースURLを登録してください（例: `http://192.168.1.10:40772`）。接続先は `server/data/config.json` に保存されます。

## 再生について

サービスごとのmirakc MPEG-TSストリームをサーバー経由でブラウザに渡し、同梱した[`mpeg2toh264`](vendor/mpeg2toh264-player/NOTICE.md)プレイヤーでH.264/AACのfragmented MP4へ変換してMSEで再生します。上流のプレイヤーパッケージはnpm未公開のため、MITライセンスのプレイヤーソースとWASM成果物を`vendor/mpeg2toh264-player`に含めています。現時点ではMSE対応ブラウザを想定しています。上流仕様上、AAC-LC音声、MPEG-2 4:2:0映像が対象で、再生中に解像度や走査方式が切り替わる場合などは制約があります。

## チャンネルAPI

`GET /api/tvhiroba/channels` はmirakc / Mirakurunのチャンネル・サービス・番組一覧をまとめ、サービスごとに現在と次の番組情報を返します。番組情報があるサービスが1つでもあれば、それらを選局一覧に表示します。番組情報が全くない場合は、地デジのサービスIDビットマスクとBSの既知のサブチャンネルIDを使ってサブチャンネルを除外します。その他の種別はサブチャンネル判定を行いません。
