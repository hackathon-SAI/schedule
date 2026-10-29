// APIベースURL（未定義ならデフォルトを設定）
const DEFAULT_API_URL = "https://schedule-backend-navy.vercel.app";

/**
 * 1. バックエンド（Neon）に問い合わせてログイン状態をチェックする関数
 */
async function checkAuth(baseUrl = window.API_BASE_URL || DEFAULT_API_URL) {
  try {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      credentials: "include" // Cookie（セッション）を送信するために必須
    });

    if (!res.ok) {
      return null; // 未ログインまたはセッション切れ
    }

    const data = await res.json();
    return data.user; // バックエンド（Neon）から返されたユーザー情報
  } catch (err) {
    console.error("認証チェック通信エラー:", err);
    return null;
  }
}

/**
 * 2. メイン画面（index.html等）用：未ログインなら login.html へ飛ばす
 */
async function requireAuth(baseUrl = window.API_BASE_URL || DEFAULT_API_URL) {
  // 認証不要の公開ページリスト
  const publicPages = [
    "index.html", // ※もし index.html も完全公開ならここに入れます（ログイン必須なら外してください）
    "login.html",
    "privacy-policy.html",
    "terms-of-service.html"
  ];

  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  // 公開ページの場合は認証チェックを行わずスルー
  if (publicPages.includes(currentPage)) {
    return null;
  }

  // バックエンドに問い合わせてユーザー情報を取得
  const user = await checkAuth(baseUrl);

  if (!user) {
    // 未ログインかつログインページでなければリダイレクト
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
    return null;
  }

  return user;
}

/**
 * 3. ログイン画面（login.html）用：すでにログイン済みなら index.html へ飛ばす
 */
async function redirectIfAuthenticated(baseUrl = window.API_BASE_URL || DEFAULT_API_URL) {
  const user = await checkAuth(baseUrl);
  if (user) {
    window.location.href = 'index.html';
  }
}