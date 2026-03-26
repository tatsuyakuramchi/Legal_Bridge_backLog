# Legal Bridge Deployment Guide

このドキュメントは、Legal Bridge をローカル環境と EC2 環境で起動・運用するための手順をまとめたものです。

## 1. 前提

共通で必要なもの:

- Node.js 22 系
- npm
- Backlog API Key
- Slack Bot Token
- Slack App Token
- Google Drive の保存先フォルダ ID

アプリの役割:

- Slack と連携
- Backlog の課題取得と状態更新
- PDF / HTML の生成
- RDS への台帳保存
- Google Drive への PDF アップロード

## 2. 共通設定項目

最低限使う環境変数:

```env
PORT=3005
APP_TITLE=Legal Bridge Local App
BACKLOG_POLLING_INTERVAL_SEC=30

BACKLOG_SPACE=arclight
BACKLOG_PROJECT_ID=LEGAL
BACKLOG_API_KEY=<your-backlog-api-key>

SLACK_BOT_TOKEN=<your-slack-bot-token>
SLACK_APP_TOKEN=<your-slack-app-token>
LEGAL_SLACK_CHANNEL=C090WRVD1TM
APPROVER_SLACK_ID=U08217X0A07
RDS_HOST=
RDS_PORT=5432
RDS_DB=
RDS_USER=
RDS_PASSWORD=
RDS_SSL=true
RDS_BOOTSTRAP_FROM_JSON=true
DATABASE_URL=
PRISMA_SCHEMA=lb_core
RDS_APP_SCHEMA=lb_app

DRIVE_ROOT_FOLDER_ID=1zXCqiESaJimlRGOffLy_tN167IheJ2Lj
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=
```

補足:

- `DRIVE_ROOT_FOLDER_ID` は Google Drive 上の親フォルダ ID
- `GOOGLE_APPLICATION_CREDENTIALS` は Google 認証 JSON のパス
- `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT` は `external_account` 利用時に必要になることがある
- RDS 未設定時は JSON ストアで動作する

## 3. ローカル環境セットアップ

### 3.1 推奨構成

ローカルでは次のどちらかを使う:

- Google サービスアカウント JSON
- AWS federation を使わない検証用設定

ローカルPCでは EC2 メタデータを参照できないため、`external_account` の AWS 用 JSON はそのままでは使えません。

### 3.2 `.env` を作成する

プロジェクトルートに `.env` を作成し、必要な値を入れます。

ローカル用の Google 認証例:

```env
GOOGLE_APPLICATION_CREDENTIALS=C:\secrets\gws-service-account.json
DRIVE_ROOT_FOLDER_ID=xxxxxxxxxxxxxxxxx
```

### 3.3 依存関係をインストールする

```powershell
npm.cmd install
```

### 3.4 ビルドする

```powershell
npm.cmd run build
```

### 3.5 起動する

開発モード:

```powershell
npm.cmd run dev
```

本番相当:

```powershell
npm.cmd start
```

### 3.6 動作確認

最低限確認する項目:

- `http://localhost:3005/health`
- 管理画面 `http://localhost:3005`
- Backlog 接続テスト
- Slack 接続テスト
- `POST /api/integrations/drive/test`
- 文書生成後に Drive URL が保存されること

### 3.7 ローカル運用の注意

- Chrome または Edge がインストールされている必要がある
- サービスアカウントを使う場合、保存先 Drive フォルダをそのサービスアカウントに共有する
- `external_account` の AWS JSON はローカルでは基本的に使えない

## 4. EC2 環境セットアップ

### 4.1 推奨構成

EC2 では次の構成を推奨します。

- EC2 に IAM Role を割り当てる
- Google Workload Identity Federation を使う
- `external_account` JSON を利用する
- 必要に応じて Google サービスアカウント impersonation を使う

この構成では長期秘密鍵を作成せずに Google Drive へアクセスできます。

### 4.2 AWS 側の前提

EC2 に付与する IAM Role で以下が必要です。

- EC2 からインスタンスメタデータへアクセスできること
- Google 側で信頼される AWS principal と一致していること

EC2 上では次の URL に到達できる必要があります。

- `http://169.254.169.254`
- `https://sts.amazonaws.com`
- `https://sts.googleapis.com`
- `https://iamcredentials.googleapis.com`
- `https://www.googleapis.com`

### 4.3 Google 側の前提

必要な設定:

- Workload Identity Pool
- AWS provider
- 必要なら `service_account_impersonation`
- Drive アップロード対象の Google サービスアカウント権限

Drive に保存するためには、最終的に Google 側で認識される主体に対象フォルダのアクセス権が必要です。

### 4.4 認証 JSON を配置する

EC2 では `external_account` JSON を配置します。

例:

```env
GOOGLE_APPLICATION_CREDENTIALS=/opt/legal-bridge/secrets/clientLibraryConfig-ec2-production.json
DRIVE_ROOT_FOLDER_ID=xxxxxxxxxxxxxxxxx
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=legal-bridge-drive@your-project.iam.gserviceaccount.com
```

補足:

- `service_account_impersonation_url` が JSON に含まれていれば `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT` は不要
- JSON に impersonation 設定がない場合は `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT` を設定する

### 4.5 アプリを配置する

例:

```bash
sudo mkdir -p /opt/legal-bridge
sudo chown ec2-user:ec2-user /opt/legal-bridge
cd /opt/legal-bridge
git clone <repository-url> app
cd app
npm install
npm run build
```

### 4.6 `.env` を配置する

例:

```env
PORT=3005
APP_TITLE=Legal Bridge
BACKLOG_POLLING_INTERVAL_SEC=30

BACKLOG_SPACE=arclight
BACKLOG_PROJECT_ID=LEGAL
BACKLOG_API_KEY=xxxxxxxx

SLACK_BOT_TOKEN=xoxb-xxxxxxxx
SLACK_APP_TOKEN=xapp-xxxxxxxx
LEGAL_SLACK_CHANNEL=CXXXXXXXX
APPROVER_SLACK_ID=UXXXXXXXX

RDS_HOST=your-rds-endpoint
RDS_PORT=5432
RDS_DB=arclight_legal
RDS_USER=legal_app
RDS_PASSWORD=xxxxxxxx
RDS_SSL=true
RDS_BOOTSTRAP_FROM_JSON=true
DATABASE_URL=postgresql://legal_app:xxxxxxxx@your-rds-endpoint:5432/arclight_legal?schema=lb_core&sslmode=require
PRISMA_SCHEMA=lb_core
RDS_APP_SCHEMA=lb_app

DRIVE_ROOT_FOLDER_ID=xxxxxxxxxxxxxxxxx
GOOGLE_APPLICATION_CREDENTIALS=/opt/legal-bridge/secrets/clientLibraryConfig-ec2-production.json
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=legal-bridge-drive@your-project.iam.gserviceaccount.com
```

### 4.7 起動する

手動起動:

```bash
npm start
```

### 4.8 systemd 例

`/etc/systemd/system/legal-bridge.service`

```ini
[Unit]
Description=Legal Bridge App
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/legal-bridge/app
EnvironmentFile=/opt/legal-bridge/app/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=ec2-user

[Install]
WantedBy=multi-user.target
```

反映:

```bash
sudo systemctl daemon-reload
sudo systemctl enable legal-bridge
sudo systemctl start legal-bridge
sudo systemctl status legal-bridge
```

### 4.9 EC2 運用の注意

- Security Group で必要なインバウンドのみ許可する
- RDS 側 Security Group から EC2 を許可する
- Drive の federation 認証は EC2 メタデータ依存のため、コンテナ化時は IMDS アクセス可否も確認する
- CloudWatch Logs 連携を入れる場合は systemd の stdout/stderr 収集方針も決める

## 5. デプロイ手順

### 5.1 ローカル更新

```powershell
git pull
npm.cmd install
npm.cmd run build
npm.cmd run test:unit
```

### 5.2 EC2 更新

```bash
cd /opt/legal-bridge/app
git pull
npm install
npm run build
npm run test:unit
sudo systemctl restart legal-bridge
```

## 6. 接続確認チェックリスト

アプリ起動後の確認:

- `GET /health` が `ok: true`
- `POST /api/integrations/backlog/test` が成功
- `POST /api/integrations/slack/test` が成功
- `POST /api/integrations/rds/test` が成功
- `POST /api/integrations/drive/test` が成功
- 文書生成で `dashboard.documents[].driveFileUrl` が入る

## 7. Google Drive 認証方式の整理

### 7.1 ローカル

推奨:

- `service_account` JSON

非推奨:

- AWS federation 用 `external_account` JSON

### 7.2 EC2

推奨:

- `external_account` JSON
- 必要に応じて `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`

### 7.3 共通化の考え方

アプリ本体は共通で運用できます。

環境ごとの差分は主に次です。

- `GOOGLE_APPLICATION_CREDENTIALS` の中身
- `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT` の有無
- `.env` の配置場所
- 起動方法

## 8. トラブルシュート

### 8.1 Drive 接続テストが失敗する

確認項目:

- `DRIVE_ROOT_FOLDER_ID` が正しいか
- 認証 JSON のパスが存在するか
- EC2 の場合、IMDS に到達できるか
- Google 側の Workload Identity Provider 設定が正しいか
- impersonation 先サービスアカウントに必要権限があるか
- 保存先フォルダにアクセス権があるか

### 8.2 PDF 生成が失敗する

確認項目:

- Chrome または Edge が存在するか
- EC2 でヘッドレス実行に必要な依存が足りているか
- `tmp/` に書き込み権限があるか

### 8.3 RDS 接続が失敗する

確認項目:

- `DATABASE_URL` の値
- `RDS_SSL` の要否
- EC2 から RDS へのネットワーク許可
- PostgreSQL ユーザー権限

## 9. 現在の実装メモ

現在の Drive 連携仕様:

- 文書生成後に Drive フォルダを作成または再利用
- PDF をアップロード
- アプリ内にはローカルの `pdfPath` と Drive の `driveFileUrl` を両方保持
- UI は Drive URL があれば優先表示
- CloudSign などローカルファイルが必要な処理は引き続き `pdfPath` を使用
