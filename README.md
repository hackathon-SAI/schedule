# Study Planner

## 📋 概要
Google アカウントでログインして、予定や課題をカレンダーで一元管理できるスケジュール管理アプリです。グループを作って、メンバーと予定を共有することもできます。

## 主な機能

- Google OAuth 認証
- カレンダー表示 (FullCalendar)
- 予題・課題の管理
- ダッシュボード (件数表示)
- グループ共有
- プロフィールの表示・編集
- レスポンシブデザイン

## 技術スタック

- Frontend: HTML, CSS, JavaScript (Vanilla), FullCalendar
- Backend: Node.js, Hono, TypeScript, Zod
- Database: PostgreSQL (Neon)
- 認証: Google OAuth 2.0, JWT (HttpOnly Cookie)
- デプロイ: Vercel

## ディレクトリ構成

schedule/
├── README.md
├── LICENSE.md
└── workplace/
    ├── backend/
    ├── frontend/
    └── docs/
      ├── API.md
      ├── DEVELOPMENT.md
      └── CONTRIBUTING.md

## クイックスタート

- Node.js 22 以上が必要です。
- Google Cloud で OAuth クライアントを作成します。
- .env ファイルを作成します (`.gitignore` で除外済みです)。

詳しい手順は [開発者ガイド](./workplace/docs/DEVELOPMENT.md) を参照してください。

## 環境変数

`workplace/backend/.env` に設定します。`.env` は絶対にコミットしないでください (`.gitignore` で除外済みです)。

| 変数名 | 必須 | 説明 |
| :-- | :--: | :-- |
| `DATABASE_URL` | ✅ | Neon (PostgreSQL) の接続文字列 |
| `JWT_SECRET` | ✅ | JWT の署名鍵。**32 文字以上**にしてください。未設定または短い場合、サーバーは起動しません |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth のクライアント ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth のクライアントシークレット |
| `FRONTEND_URL` | 推奨 | フロントエンドの URL。CORS の許可オリジンに追加されます |
| `PORT` | 任意 | ローカル開発時のポート番号 (既定値: `5000`) |
| `NODE_ENV` | 任意 | `production` で、Cookie の `Secure` 属性、500 エラー詳細の非表示、localhost 系 CORS の無効化が有効になります |

## API 概要

`/api/auth/google` 以外は、ログイン (Cookie の JWT) が必要です。詳細は [API 仕様](./workplace/docs/API.md) を参照してください。

| 区分 | エンドポイント | 概要 |
| :-- | :-- | :-- |
| 認証 | `POST /api/auth/google` | Google の認可コードでログイン |
| 認証 | `GET /api/auth/me` | ログイン中のユーザー情報を取得 |
| 認証 | `POST /api/auth/logout` | ログアウト |
| 予定 | `GET /api/events?groupId=` | グループの予定一覧 |
| 予定 | `POST /api/events` | 予定の作成 |
| 予定 | `PUT /api/events/:id` | 予定の更新 (作成者または管理者) |
| 予定 | `DELETE /api/events/:id` | 予定の削除 (作成者または管理者) |
| グループ | `GET /api/groups` | 所属グループの一覧 |
| グループ | `POST /api/groups` | グループの作成 |
| グループ | `POST /api/groups/join` | 招待コードで参加 |
| グループ | `GET /api/groups/:id/events` | グループの共有予定 (メンバーのみ) |
| ユーザー | `GET /api/users/me` | プロフィールの取得 |
| ユーザー | `PUT /api/users/me` | プロフィールの更新 |

## セキュリティ

- JWT は HttpOnly Cookie で発行します (本番では Secure 付き)。
- JWT_SECRET に既定値はありません。未設定の場合は起動に失敗します。
- CORS は許可リストに完全一致したオリジンだけを許可します。
- レート制限: /api/* は 1 分あたり 100 回、/api/auth/google は 15 分あたり 20 回です。
- 入力値は Zod で検証します。
- 予定やグループの操作は、ログインユーザー本人の所属・権限を確認してから実行します。
- 本番環境では、500 エラーの詳細メッセージをクライアントへ返しません。

## デプロイ

バックエンドは Vercel の Serverless Functions として動作します (workplace/backend/vercel.json を参照)。Vercel のプロジェクト設定で環境変数を登録し、NODE_ENV=production で動作させてください。

## ドキュメント

- [開発者ガイド](./workplace/docs/DEVELOPMENT.md)
- [API 仕様](./workplace/docs/API.md)
- [コントリビューションガイド](./workplace/docs/CONTRIBUTING.md)

## コントリビューション

歓迎します。フォークしてブランチを作成し、プルリクエストを送ってください。手順は コントリビューションガイド を参照してください。コミットメッセージは `feat: 機能名を追加` のように、種別を付けて書いてください。

## ライセンス

[MIT License](./LICENSE.md) のもとで公開しています。Copyright (c) 2026 hackathon-SAI
