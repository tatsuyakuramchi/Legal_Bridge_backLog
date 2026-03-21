# Legal Bridge Setup

このファイルは、Backlog と Slack Socket Mode を中心に、ローカルアプリを動かすための設定手順です。設計書 v1.8 / v3.5 で追加された RDS / Google Drive の前提値もここにまとめています。

## 1. `.env` を作成する

[\.env.example](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\.env.example) を [\.env](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\.env) にコピーして値を埋めます。

```env
PORT=3005
BACKLOG_POLLING_INTERVAL_SEC=30
BACKLOG_SPACE=your-space
BACKLOG_PROJECT_ID=LEGAL
BACKLOG_API_KEY=your_backlog_api_key
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
LEGAL_SLACK_CHANNEL=C0123456789
APPROVER_SLACK_ID=U0123456789
RDS_HOST=your-rds-endpoint
RDS_DB=arclight_legal
RDS_USER=legal_app
RDS_PASSWORD=your_password
GOOGLE_APPLICATION_CREDENTIALS=C:\secrets\gws-key.json
DRIVE_ROOT_FOLDER_ID=your_drive_folder_id
```

## 2. Backlog を設定する

必要な値:

- `BACKLOG_SPACE`
  - `https://your-space.backlog.com` の `your-space`
- `BACKLOG_PROJECT_ID`
  - プロジェクトキー `LEGAL` など
- `BACKLOG_API_KEY`
  - Backlog 個人設定から発行した API Key

確認方法:

1. アプリ起動後に管理画面を開く
2. `Backlog接続テスト` を実行する
3. 対象プロジェクト名が返れば設定完了

## 3. Slack Socket Mode を設定する

Slack App 側で必要な設定:

1. `Socket Mode` を有効化する
2. `App-Level Token` を発行する
   - Scope: `connections:write`
3. `OAuth & Permissions` で Bot Token を発行する
4. Bot Token Scopes を付与する
   - `chat:write`
   - `app_mentions:read`
   - slash command を使うなら `commands`
5. 対象チャンネルにアプリを招待する

必要な環境変数:

- `SLACK_APP_TOKEN`
- `SLACK_BOT_TOKEN`
- `LEGAL_SLACK_CHANNEL`
- `APPROVER_SLACK_ID` は任意

確認方法:

1. アプリ起動後に `Slack接続テスト` を実行する
2. `@legal-bridge health` を送る
3. 応答が返れば疎通完了

## 4. Backlog 初期設定チェックリストを出力する

テンプレート定義から Backlog の課題タイプ、共通ステータス、共通属性、テンプレート固有属性を出せます。

```powershell
npm.cmd run build
npm.cmd run templates:backlog-init
npm.cmd run templates:backlog-init -- --markdown
npm.cmd run templates:backlog-setup -- license_basic
npm.cmd run templates:backlog-setup -- license_basic --markdown
```

Markdown 出力時は、プロジェクト直下に以下を保存します。

- `backlog-initial-setup.md`
- `backlog-setup-license_basic.md`

API から取得する場合:

- [checklist](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\src\server.ts)
  - `GET /api/backlog-setup/checklist`
  - `GET /api/backlog-setup/checklist/markdown`
- [reports](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\src\server.ts)
  - `GET /api/backlog-setup/reports/:id`
  - `GET /api/backlog-setup/reports/:id/markdown`

## 5. RDS / Google Drive の前提

現時点では接続先の値だけ保持しています。設計書 v3.5 で想定されている前提は以下です。

- RDS は PostgreSQL 15 想定
- ローカルアプリから RDS へはアウトバウンド接続のみ
- 文書は `tmp/` で一時生成してから Drive に保存する想定
- Google Drive はサービスアカウントでアクセスする想定

## 6. 起動

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

本番想定:

```powershell
npm.cmd run build
npm.cmd start
```

## 7. 動作確認

設定済みなら最低限ここまで確認します。

- `GET /health`
- Backlog 接続テスト
- Slack 接続テスト
- `@legal-bridge health`
- `npm.cmd run templates:backlog-init -- --markdown`

## 8. まだ未実装の本番機能

- Google Drive への実アップロード
- RDS への実保存
- CloudSign など押印系フロー
- 承認後の Slack DM / 自動通知の本実装
