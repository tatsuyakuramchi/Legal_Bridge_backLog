# Legal Bridge Backlog

Backlog の課題を起点に文書テンプレートを使って契約書や通知書を生成し、Slack と連携するローカルアプリです。

## 現在できること

- 管理画面から課題、生成文書、イベントログを確認
- HTML テンプレートから文書を生成して PDF / HTML を保存
- Backlog API との接続確認
- Backlog 課題の同期
- Slack 通知送信
- Slack Socket Mode で `app_mention` / slash command を受信

## 技術構成

- Node.js
- TypeScript
- Express
- Handlebars
- pdf-lib
- Slack Socket Mode

## セットアップ

詳細は [SETUP.md](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\SETUP.md) を参照してください。

最小構成では `.env` に次を設定します。

```env
BACKLOG_API_KEY=
BACKLOG_SPACE=
BACKLOG_PROJECT_ID=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
LEGAL_SLACK_CHANNEL=
```

## 起動

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

本番相当の起動:

```powershell
npm.cmd run build
npm.cmd start
```

## Slack コマンド

- `health`
- `poll`
- `generate LEGAL-101`

例:

```text
@legal-bridge health
@legal-bridge poll
@legal-bridge generate LEGAL-101
```

## 生成物

- テンプレート: `templates/`
- 一時生成物: `tmp/`
- サンプル生成物: `sample/`

## 未実装

- Google Drive アップロード
- RDS 永続化
- 本番向け運用設計の仕上げ
