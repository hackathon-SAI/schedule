// ===== 重要: ページ読み込み時に URL の ?token= を即座に localStorage に保存 =====
// Google OAuth リダイレクト後のトークンを、他の認証チェックより先に保存する
(function immediateTokenExtraction() {
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');

  // トークンが存在し、かつ空文字（""）ではない場合のみ保存する
  if (token && token.trim() !== "") {
    // トークンを jwt_token キーに保存（後方互換性のため token キーにも保存）
    localStorage.setItem('jwt_token', token);
    localStorage.setItem('token', token);
    console.log('✅ 有効なトークンをURLから正常に保存しました（jwt_token と token キー）');

    // URL から token パラメータのみを綺麗に削除（他のパラメータやハッシュは保持）
    searchParams.delete('token');
    const newSearch = searchParams.toString();
    const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, document.title, cleanUrl);
  } else if (window.location.search.includes('token')) {
    console.warn('⚠️ トークンが空の状態でリダイレクトされました');
    searchParams.delete('token');
    const newSearch = searchParams.toString();
    const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, document.title, cleanUrl);
  }
})();

// ===== APIベースURL（未定義ならデフォルトを設定） =====
const DEFAULT_API_URL = "https://schedule-backend-navy.vercel.app";

// ===== JWT トークンを localStorage に保存・取得する関数 =====
const TokenStorage = {
  set(token) {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('jwt_token', token);
      console.log('✅ トークンを正常に保存しました');
    }
  },
  get() {
    return localStorage.getItem('token') || localStorage.getItem('jwt_token');
  },
  clear() {
    localStorage.removeItem('token');
    localStorage.removeItem('jwt_token');
  }
};
window.TokenStorage = TokenStorage;

// ===== JWT トークンを含む認証ヘッダーを構築（グローバル利用可能） =====
function buildAuthHeaders(extraHeaders = {}) {
  const token = TokenStorage.get();
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
window.buildAuthHeaders = buildAuthHeaders;

/**
 * トークンが localStorage に保存されるまで待機する
 */
async function waitForToken(timeout = 500) {
  const startTime = Date.now();
  const checkInterval = 30;
  
  return new Promise((resolve) => {
    const check = () => {
      const token = TokenStorage.get();
      if (token && token.trim() !== "") {
        resolve(token);
        return;
      }
      if (Date.now() - startTime > timeout) {
        resolve(null);
        return;
      }
      setTimeout(check, checkInterval);
    };
    check();
  });
}

/**
 * 1. バックエンドに問い合わせてログイン状態をチェックする関数
 */
async function checkAuth(baseUrl = window.API_BASE_URL || DEFAULT_API_URL) {
  // デモモード中はダミーユーザー情報を返す（バックエンド認証チェックは不要）
  if (window.DemoMode?.active) {
    return {
      id: 0,
      email: "demo@demo.local",
      name: "デモユーザー",
      mode: "demo",
    };
  }

  // URLにtokenパラメータがあった場合は保存完了を待機
  if (window.location.search.includes('token')) {
    await waitForToken(1000);
  }

  const token = TokenStorage.get();
  if (!token) {
    return null;
  }

  const headers = buildAuthHeaders();

  try {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      headers,
      credentials: "include"
    });

    if (res.status === 401) {
      // 認証切れ・無効なトークンはクリアしてループを防止
      TokenStorage.clear();
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data.user;
  } catch (err) {
    console.error("認証チェック通信エラー:", err);
    return null;
  }
}

/**
 * 2. 認証が必要な画面用：未ログインなら login.html へ飛ばす
 */
async function requireAuth(baseUrl = window.API_BASE_URL || DEFAULT_API_URL) {
  // 認証不要の公開ページリスト（※calendar.htmlはログイン必須）
  const publicPages = [
    "index.html",
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
    if (window.DemoMode?.active) {
      window.DemoMode.expire();
      return null;
    }

    // 未ログインかつログインページでなければリダイレクト
    redirectToLoginIfStillUnauthenticated();
    return null;
  }

  return user;
}

/**
 * リダイレクト前にトークン復旧を少し待機（非同期セットのガード）
 */
let redirectTimer = null;

function redirectToLoginIfStillUnauthenticated(delayMs = 300) {
  if (redirectTimer) {
    clearTimeout(redirectTimer);
  }

  redirectTimer = setTimeout(() => {
    // デモモードならリダイレクト不要
    if (window.DemoMode?.active) {
      return;
    }

    // トークンが存在すればリダイレクトをキャンセル
    const token = TokenStorage.get();
    if (token && token.trim() !== "") {
      return;
    }

    // ログインページへのリダイレクト実行
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
  }, delayMs);
}

/**
 * 3. ログイン画面（login.html）用：すでにログイン済みなら calendar.html へ飛ばす
 */
async function redirectIfAuthenticated(baseUrl = window.API_BASE_URL || DEFAULT_API_URL) {
  const user = await checkAuth(baseUrl);
  if (user) {
    window.location.href = 'calendar.html';
  }
}
