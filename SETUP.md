# Legal Bridge Setup

この段階では、Backlog と Slack の設定まで行えばローカルアプリの接続確認ができます。

## 1. 環境変数

`.env.example` を `C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\.env` としてコピーし、最低限次を設定します。

```env
BACKLOG_API_KEY=your_backlog_api_key
BACKLOG_SPACE=your-space
BACKLOG_PROJECT_ID=LEGAL
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
LEGAL_SLACK_CHANNEL=C0123456789
```

必要に応じて `APPROVER_SLACK_ID` も設定してください。

## 2. Backlog 設定

必要な値:

- `BACKLOG_SPACE`
  - Backlog の URL が `https://your-space.backlog.com` なら `your-space`
- `BACKLOG_PROJECT_ID`
  - プロジェクトキー `LEGAL` またはプロジェクト ID
- `BACKLOG_API_KEY`
  - Backlog の個人設定から発行した API キー

確認方法:

1. アプリ起動後、画面左の `Backlog Space` と `Project ID` を入力して保存します。
2. `Backlog接続テスト` を押します。
3. 成功すると対象プロジェクト名が表示されます。

## 3. Slack Socket Mode 設定

Slack App 側で必要な設定:

1. `Socket Mode` を `Enable`
2. `App-Level Token` を発行
   - Scope は `connections:write`
3. `OAuth & Permissions` で Bot Token を発行
4. Bot Token Scopes を追加
   - `chat:write`
   - `app_mentions:read`
   - slash command を使うなら `commands`
5. ワークスペースへアプリをインストール

このアプリで使う値:

- `SLACK_APP_TOKEN`
  - `xapp-...`
- `SLACK_BOT_TOKEN`
  - `xoxb-...`
- `LEGAL_SLACK_CHANNEL`
  - 通知先チャンネル ID

確認方法:

1. アプリ起動時に Socket Mode が自動接続されます。
2. 画面左の `Slack Channel` を入力して保存します。
3. `Slack接続テスト` を押します。
4. 対象チャンネルに接続テストメッセージが届けば完了です。

## 4. Slack で使えるコマンド

`app_mention` または slash command で次を処理します。

- `health`
- `poll`
- `generate LEGAL-101`

例:

```text
@legal-bridge health
@legal-bridge poll
@legal-bridge generate LEGAL-101
```

## 5. ローカル起動

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

本番相当で起動する場合:

```powershell
npm.cmd run build
npm.cmd start
```

## 6. 現時点の到達点

設定までで確認できるもの:

- Backlog API 接続確認
- Slack Socket Mode 接続
- Slack 通知送信
- Backlog 課題の同期

まだ未完了のもの:

- Google Drive アップロード
- RDS 永続化
- 本番用の監視、再接続設計、認可の整理
