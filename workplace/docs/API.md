# API仕様

## 認証API

- `POST /api/auth/google`: Googleログイン
- `GET /api/auth/me`: ログインユーザー情報取得。初回取得時にGoogleプロフィール画像を白地に単色の自動生成アイコンへ置き換え、DBに保存する
- `PATCH /api/auth/me`: ログインユーザーのニックネーム更新
  - リクエストボディ: `{ "name": "ニックネーム" }`（1〜50文字）
- `DELETE /api/auth/me`: 会員登録と本人が作成した予定を削除する。所属グループは残し、管理者権限とグループ作成者を他メンバーへ引き継ぐ。最後のメンバーとなるグループは共有予定とともに削除する
- `POST /api/auth/logout`: ログアウト
- `GET /api/auth/google/classroom/coursework`: ログイン中のGoogleアカウントが閲覧できるClassroomの公開済み課題のうち、作成日時が今年度（4月1日〜翌年4月1日）に含まれるもの
- `GET /api/auth/google/calendar/events`: Googleカレンダーの予定のうち、作成日時が今年度に含まれるもの。予定日も今年度内を既定範囲として取得（`timeMin` / `timeMax` で指定可）

Google連携機能を使うには、Google Cloud ConsoleでClassroom APIとCalendar APIを有効化し、OAuthの権限確認を完了してください。新しい権限を追加した既存ユーザーは、カレンダー画面からGoogle連携を再認証する必要があります。

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
  - 概要: 招待コードやIDを使ってグループに参加する。すでに参加済みの場合は `409` を返す
- `DELETE /api/groups/:id/leave`
  - 概要: ログインユーザーがグループから脱退する。最後のメンバーの場合はグループと共有予定も削除する

グループAPIを使う前に、`workplace/backend/migrations/20261030_reconcile_groups_schema.sql` を
NeonのSQL Editorで実行してください。`groups.name` と `groups.created_by` 列を追加し、
既存の `group_name` 列があればグループ名へ引き継ぎます。名前がない既存グループには
`グループ <ID>` を設定し、作成者が未設定の場合は管理者、または最初のメンバーを設定します。
このマイグレーションは再実行できます。

## グループ内共有イベント API
- `GET /api/groups/:id/events`
  - 概要: 指定したグループ内で共有されているイベント一覧を取得する
- `POST /api/groups/:id/events`
  - 概要: グループ内に新しい共有イベントを作成する
