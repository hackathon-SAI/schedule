# API仕様

## 認証API

- `POST /api/auth/google`: Googleログイン
- `GET /api/auth/me`: ログインユーザー情報取得
- `PATCH /api/auth/me`: ログインユーザーのニックネーム更新
  - リクエストボディ: `{ "name": "ニックネーム" }`（1〜50文字）
- `POST /api/auth/logout`: ログアウト

## イベントAPI

- `GET /api/events`: イベント一覧取得
- `POST /api/events`: イベント作成
- `PUT /api/events/:id`: イベント更新
- `DELETE /api/events/:id`: イベント削除

## グループ API
- `GET /api/groups`
  - 概要: ログインユーザーが所属するグループの一覧を取得する
- `POST /api/groups`
  - 概要: 新規グループを作成する
  - リクエストボディ: `{ "name": "グループ名" }`
- `GET /api/groups/:id`
  - 概要: 特定のグループの詳細情報（メンバー一覧など）を取得する
- `POST /api/groups/join` または `POST /api/groups/:id/join`
  - 概要: 招待コードやIDを使ってグループに参加する

## グループ内共有イベント API
- `GET /api/groups/:id/events`
  - 概要: 指定したグループ内で共有されているイベント一覧を取得する
- `POST /api/groups/:id/events`
  - 概要: グループ内に新しい共有イベントを作成する
