// APIベースURL（最新のプロダクションデプロイ）
const API_BASE_URL = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
// バックエンドのCORS設定に合わせた認証エンドポイント base
// fetch POSTでの認証回避のため、リダイレクト認証フローを使用します

let codeClient;
const selectAccount = new URLSearchParams(window.location.search).get('select_account') === 'true';
const reauthorizeGoogle = new URLSearchParams(window.location.search).get('reauthorize_google') === 'true';

// Google OAuth リダイレクト認証の初期化
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    console.warn('Google SDK がまだ読み込まれていません。再試行します...');
    setTimeout(initGoogleAuth, 500);
    return;
  }

  // Google Identity Services を使用してリダイレクト認証を設定
  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: '1067955587484-appns84s4nb5t13797i53ur56e7ng49f.apps.googleusercontent.com',
    select_account: selectAccount,
    access_type: 'offline',
    state: window.location.origin,
    ...(reauthorizeGoogle ? { prompt: 'consent' } : {}),
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/classroom.course-work.readonly',
    ].join(' '),

    ux_mode: 'redirect',
    redirect_uri: `${API_BASE_URL}/api/auth/google/callback`,
    callback: (response) => {
      console.log('Google OAuth redirect response:', response);
    }
  });
}

// Google認証リダイレクト開始
function startGoogleAuthRedirect() {
  if (codeClient) {
    codeClient.requestCode();
  } else {
    initGoogleAuth();
    setTimeout(() => {
      if (codeClient) {
        codeClient.requestCode();
      } else {
        alert('Google ログインの初期化中です。少々お待ちください。');
      }
    }, 1000);
  }
}

// ページ読み込み時
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const errorParam = urlParams.get('error');

  if (errorParam) {
    console.error('ログインエラー:', errorParam);
    const desc = document.querySelector('.login-description');
    if (desc) {
      desc.textContent = 'ログインに失敗しました。もう一度お試しください。 (' + errorParam + ')';
      desc.style.color = '#e53935';
    }
  } else if (typeof redirectIfAuthenticated === 'function') {
    redirectIfAuthenticated(API_BASE_URL);
  }

  initGoogleAuth();
});

// ボタンクリック時に呼び出す関数（リダイレクトモード用）
function loginWithGoogle() {
  startGoogleAuthRedirect();
}
