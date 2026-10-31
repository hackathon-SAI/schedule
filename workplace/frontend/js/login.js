// APIベースURL（本番環境用）
const API_BASE_URL = "https://schedule-backend-navy.vercel.app";

let codeClient;
const selectAccount = new URLSearchParams(window.location.search).get('select_account') === 'true';

// Google OAuth クライアントの初期化
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    console.warn('Google SDK がまだ読み込まれていません。再試行します...');
    setTimeout(initGoogleAuth, 500);
    return;
  }

  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: '1067955587484-appns84s4nb5t13797i53ur56e7ng49f.apps.googleusercontent.com',
    select_account: selectAccount,
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
    
    // 👇 ポップアップモードに戻す
    ux_mode: 'popup',
    
    // 👇 コールバック関数をその場で直接定義（スコープエラーを防ぐためインライン記述）
    callback: async (response) => {
      if (response.error) {
        console.error('Google 認可エラー:', response.error);
        return;
      }

      console.log('1. Googleから認可コードを取得しました。バックエンドに送信します...');

      try {
        console.log('2. fetch を開始します:', `${API_BASE_URL}/api/auth/google`);

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

        console.log('3. バックエンドからレスポンスを受信しました。Status:', res.status);

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`バックエンド認証エラー (ステータス: ${res.status}):`, errorText);
          alert(`ログイン処理に失敗しました (Status: ${res.status})`);
          return;
        }

        const data = await res.json();
        console.log('4. ログイン成功！ calendar.html へ遷移します。', data);
        window.location.href = 'calendar.html';

      } catch (err) {
        console.error('通信エラー発生:', err);
        alert('サーバーとの通信に失敗しました（コンソール詳細を確認してください）');
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