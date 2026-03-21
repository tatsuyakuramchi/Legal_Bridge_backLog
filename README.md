# Legal Bridge Backlog

Backlog の課題を起点に文書を生成し、ローカル管理画面と Slack Socket Mode で運用するローカルアプリです。

## 現在できること

- テンプレート HTML から PDF / HTML を生成
- Backlog 接続テストと課題取得
- Slack Socket Mode 接続テストとコマンド受信
- テンプレート定義の一覧、追加、検証
- Backlog 初期設定チェックリストの生成

## セットアップ

詳細は [SETUP.md](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\SETUP.md) を参照してください。

最低限必要な環境変数は [\.env.example](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\.env.example) にあります。

```env
BACKLOG_SPACE=
BACKLOG_PROJECT_ID=
BACKLOG_API_KEY=
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

本番想定で起動する場合:

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

## テンプレート管理

```powershell
npm.cmd run templates:list
npm.cmd run templates:validate
npm.cmd run templates:add -- <id> <templateFile> <documentName> <issueTypesCsv> [C|PO|LIC]
npm.cmd run templates:backlog-init
npm.cmd run templates:backlog-init -- --markdown
npm.cmd run templates:backlog-setup -- <templateId>
npm.cmd run templates:backlog-setup -- <templateId> --markdown
```

`--markdown` を付けると、プロジェクト直下に `backlog-initial-setup.md` または `backlog-setup-<templateId>.md` を出力します。

## 主要ディレクトリ

- テンプレート: `templates/`
- テンプレート定義: `templates/definitions/`
- 一時生成物: `tmp/`
- サンプル出力: `sample/`

## 未実装

- Google Drive 実アップロード
- RDS 永続化
- 本番向けの障害監視、再送、保守運用機能
