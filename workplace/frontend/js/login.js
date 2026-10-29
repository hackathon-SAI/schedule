// APIベースURL（本番環境用）
const API_BASE_URL = "https://schedule-backend-navy.vercel.app";

let codeClient;

// Google OAuth クライアントの初期化
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    console.warn('Google SDK がまだ読み込まれていません。再試行します...');
    setTimeout(initGoogleAuth, 500);
    return;
  }

  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: '1067955587484-jiuifljib05r35bfj25orgjucl2ctjbe.apps.googleusercontent.com',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/classroom.course-work.readonly',
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.freebusy',
      'https://www.googleapis.com/auth/classroom.announcements'
    ].join(' '),
    ux_mode: 'popup',

    // 👇 コールバックを外に出さず、ここで直接アロー関数として定義する！
    callback: async (response) => {
      if (response.error) {
        console.error('Google 認可エラー:', response.error);
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            code: response.code,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`バックエンド認証エラー (ステータス: ${res.status}):`, errorText);
          alert(`ログイン処理に失敗しました (Status: ${res.status})`);
          return;
        }

        const data = await res.json();
        window.location.href = 'index.html';

      } catch (err) {
        console.error('通信エラー:', err);
        alert('サーバーとの通信に失敗しました');
      }
    }
  });
}

// ページ読み込み時
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof redirectIfAuthenticated === 'function') {
    redirectIfAuthenticated(API_BASE_URL);
  }
  initGoogleAuth();
});

// ボタンクリック時に呼び出す関数
function loginWithGoogle() {
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