# Legal Bridge Setup

このファイルは、Backlog と Slack Socket Mode を中心に、ローカルアプリを動かすための設定手順です。設計書 v1.8 / v3.5 で追加された RDS / Google Drive の前提値と、Slack ワークフローの推奨フォーム設定もここにまとめています。

## 1. `.env` を作成する

[\.env.example](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\.env.example) を [\.env](C:\Users\cha-b\OneDrive\デスクトップ\Legal_Bridge_backLog\.env) にコピーして値を埋めます。

```env
PORT=3005
BACKLOG_POLLING_INTERVAL_SEC=30
BACKLOG_SPACE=arclight
BACKLOG_PROJECT_ID=LEGAL
BACKLOG_API_KEY=your_backlog_api_key
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
LEGAL_SLACK_CHANNEL=CXXXXXXXXXX
APPROVER_SLACK_ID=UXXXXXXXXXX
RDS_HOST=your-rds-endpoint
RDS_PORT=5432
RDS_DB=arclight_legal
RDS_USER=legal_app
RDS_PASSWORD=your_password
RDS_SSL=true
RDS_BOOTSTRAP_FROM_JSON=true
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

## 4. Slack ワークフローの詳細設定

設計書上は Slack Workflow Builder を入口にした運用を想定しています。現時点のアプリは Workflow Builder の送信結果を直接 API 受信して Backlog 起票するところまでは未実装なので、まずは次の形で設定してください。

- Workflow Builder で申請フォームを作る
- 送信先は `LEGAL_SLACK_CHANNEL`
- 投稿本文に申請内容を整形して残す
- 法務担当者がその内容をもとに Backlog 課題を作成、または既存課題へ転記する
- 以後の疎通確認は `@legal-bridge health` / `poll` / `generate LEGAL-101` で行う

### 4.1 通常契約申請ワークフロー

用途:

- NDA
- 業務委託
- 売買契約
- ライセンス契約
- 支払通知書など単票系

推奨フォーム項目:

- 申請者名
  - 短文
  - 必須
- 所属部署
  - 短文
  - 必須
- 契約種別
  - 単一選択
  - 必須
  - 例: NDA / 業務委託 / 売買契約（売手） / 売買契約（買手） / ライセンス契約 / 支払通知書
- 相手方名
  - 短文
  - 必須
- 相手方担当者
  - 短文
  - 任意
- 相手方メールアドレス
  - メール
  - 任意
- 案件名
  - 短文
  - 必須
- 希望テンプレート
  - 単一選択
  - 必須
  - 例: `template_nda`, `template_service_basic`, `template_sales_buyer`, `template_license_basic`
- 依頼内容
  - 長文
  - 必須
- 希望納期
  - 日付
  - 任意
- 添付資料 URL
  - 短文
  - 任意
- 備考
  - 長文
  - 任意

投稿メッセージ例:

```text
[契約申請]
申請者: {{申請者名}}
部署: {{所属部署}}
契約種別: {{契約種別}}
相手方: {{相手方名}}
案件名: {{案件名}}
テンプレート: {{希望テンプレート}}
納期: {{希望納期}}
依頼内容: {{依頼内容}}
添付資料: {{添付資料 URL}}
備考: {{備考}}
```

### 4.2 一括発注書申請ワークフロー

用途:

- CSV や一覧表をもとに複数の発注書をまとめて起案するケース

推奨フォーム項目:

- 申請者名
- 所属部署
- 発注件数
  - 数値
  - 必須
- 一括発注対象月
  - 短文
  - 必須
- 元データ URL
  - 必須
- 納品希望日
  - 任意
- 備考

投稿メッセージ例:

```text
[一括発注書申請]
申請者: {{申請者名}}
部署: {{所属部署}}
件数: {{発注件数}}
対象月: {{一括発注対象月}}
元データ: {{元データ URL}}
納品希望日: {{納品希望日}}
備考: {{備考}}
```

### 4.3 法務承認ワークフロー

用途:

- 文書ドラフトの確認依頼

推奨フォーム項目:

- Backlog 課題キー
  - 短文
  - 必須
  - 例: `LEGAL-101`
- 文書名
  - 短文
  - 必須
- PDF URL
  - 短文
  - 任意
- 承認者
  - ユーザー選択
  - 必須
- コメント
  - 長文
  - 任意

投稿後の運用:

- 承認者メンション付きで法務チャンネルへ投稿
- 承認結果は Backlog コメントへ転記

### 4.4 押印依頼ワークフロー

用途:

- 承認済み文書を紙押印または電子署名へ回す

推奨フォーム項目:

- Backlog 課題キー
- 文書名
- 押印方法
  - 単一選択
  - 必須
  - `紙押印` / `電子署名`
- 相手方送付先メール
  - メール
  - 電子署名時は必須
- 署名期限
  - 日付
  - 任意
- PDF URL
  - 任意
- 備考

投稿後の運用:

- 押印方法ごとに担当者をメンション
- 署名完了後に Drive URL を Backlog に反映

### 4.5 相手方確認完了ワークフロー

用途:

- 相手方から OK が返った時点の記録

推奨フォーム項目:

- Backlog 課題キー
- 相手方名
- 確認方法
  - 単一選択
  - `メール` / `Slack` / `CloudSign` / `口頭`
- 確認日
  - 日付
- 証跡 URL
  - 任意
- コメント

### 4.6 納品・検収ワークフロー

用途:

- 発注書、納品依頼、検収レポート系の案件管理

推奨フォーム項目:

- Backlog 課題キー
- 発注先
- 納品日
- 検収期限
- 納品物 URL
- 検収担当者
- 備考

### 4.7 リマインドワークフロー

用途:

- 承認待ち
- 押印待ち
- 納品待ち

推奨フォーム項目:

- Backlog 課題キー
- リマインド対象
  - 単一選択
  - `承認待ち` / `押印待ち` / `納品待ち`
- 通知先ユーザー
  - ユーザー選択
- 期限
  - 日付
- メッセージ
  - 長文

### 4.8 Workflow Builder 側の実装メモ

- 各ワークフローの投稿先は `LEGAL_SLACK_CHANNEL`
- 投稿タイトルに `[契約申請]` など固定プレフィックスを付ける
- Backlog 課題キーがあるフローは必ず `LEGAL-123` 形式に統一する
- テンプレート名はアプリ内のファイル名と合わせる
  - 例: `template_nda`
- 後続で自動連携する前提なら、項目名は日本語で固定して運用する

### 4.9 現時点の制約

- Workflow Builder 送信から Backlog 課題を自動生成する処理は未実装
- Slack Block Kit 承認 UI、押印依頼 UI、DM リマインド自動送信も未実装
- そのため今は「Slack で申請を受ける」「法務担当が Backlog に起票する」運用が前提

## 5. Backlog 初期設定チェックリストを出力する

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

## 6. RDS / Google Drive の前提

現時点では接続先の値だけ保持しています。設計書 v3.5 で想定されている前提は以下です。

- RDS は PostgreSQL 15 想定
- ローカルアプリから RDS へはアウトバウンド接続のみ
- `RDS_HOST / RDS_DB / RDS_USER / RDS_PASSWORD` が入るとアプリは PostgreSQL を使用
- RDS が未設定なら従来どおり `data/*.json` を使用
- `RDS_BOOTSTRAP_FROM_JSON=true` の場合、初回起動時に JSON データを RDS へ移行
- 文書は `tmp/` で一時生成してから Drive に保存する想定
- Google Drive はサービスアカウントでアクセスする想定

## 7. 起動

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

## 8. 動作確認

設定済みなら最低限ここまで確認します。

- `GET /health`
- Backlog 接続テスト
- Slack 接続テスト
- `@legal-bridge health`
- `npm.cmd run templates:backlog-init -- --markdown`

## 9. まだ未実装の本番機能

- Google Drive への実アップロード
- RDS への実保存
- CloudSign など押印系フロー
- Workflow Builder 送信内容の自動 Backlog 起票
- 承認後の Slack DM / 自動通知の本実装
## 10. Backlog 状態運用

Backlog は 1 プロジェクトあたり最大 12 状態までのため、このアプリでは次の 12 状態運用を前提にする。

- `未対応`
- `処理中`
- `処理済み`
- `完了`
- `草案`
- `レビュー中`
- `承認待ち`
- `相手方確認待ち`
- `押印依頼中`
- `締結済`
- `破棄`
- `文書生成依頼`

主運用の流れ:

- `未対応` → `草案`
- `草案` → `レビュー中`
- `レビュー中` → `文書生成依頼`
- `文書生成依頼` → `承認待ち`
- `承認待ち` → `相手方確認待ち`
- `相手方確認待ち` → `押印依頼中`
- `押印依頼中` → `締結済`
- `締結済` → `完了`
- 任意の状態 → `破棄`

補足:

- `未対応 / 処理中 / 処理済み / 完了` は Backlog 標準状態
- 実運用では `草案` 以降の日本語状態を主に使う
- `処理済み` は必須ではなく、暫定運用用として扱う

## 11. Slack 通知方針

状態変更によって Slack で申請者や法務担当者へ通知することは可能。

現在の実装でできること:

- 承認依頼時の Slack 通知
- 承認リマインド通知
- 押印依頼通知
- 押印リマインド通知
- CloudSign 送信後通知
- CloudSign 完了後通知
- 任意課題の手動通知 API

現状のコード参照:

- `src/services/workflowService.ts`
- `src/services/slackService.ts`
- `src/server.ts`

現在の通知先:

- 法務チャンネル `LEGAL_SLACK_CHANNEL`
- 承認者 `APPROVER_SLACK_ID`

今後追加しやすい通知:

- `草案` になった時に申請者へ受付通知
- `レビュー中` になった時に法務担当者へ通知
- `承認待ち` になった時に承認者へ通知
- `相手方確認待ち` になった時に担当者へ通知
- `押印依頼中` になった時に法務チャンネルへ通知
- `締結済` になった時に申請者へ完了通知
- `破棄` になった時に申請者へ差戻し / 中止通知

実装上の考え方:

- Backlog ステータス変更を検知
- ステータスごとに通知先を決定
- `chat.postMessage` でチャンネル通知または DM 通知

補足:

- 申請者への DM 通知を安定運用するには、申請者の Slack ユーザー ID を課題データまたはユーザーマスタへ保持する必要がある
- 法務担当者通知は `LEGAL_SLACK_CHANNEL` ベースでそのまま運用しやすい
