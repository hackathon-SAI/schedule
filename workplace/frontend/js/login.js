let codeClient;

// Google OAuth クライアントの初期化
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    console.warn('Google SDK がまだ読み込まれていません。再試行します...');
    setTimeout(initGoogleAuth, 500); // 0.5秒後に再試行
    return;
  }

  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: '1067955587484-jiuifljib05r35bfj25orgjucl2ctjbe.apps.googleusercontent.com', // login.html の data-client_id と同じもの
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
    callback: handleCodeResponse, // 認可コード交換後のコールバック
  });
}

// 1. 既にログイン済みならメイン画面（index.html）へ移動
document.addEventListener('DOMContentLoaded', async () => {
  // ログイン状態をチェック
  if (typeof redirectIfAuthenticated === 'function') {
    redirectIfAuthenticated(API_BASE_URL);
  }

  // Google OAuth クライアント初期化
  initGoogleAuth();
});

// ボタンクリック時に呼び出す関数（GSI ボタンの代わりに使用）
function loginWithGoogle() {
  if (codeClient) {
    codeClient.requestCode();
  } else {
    // まだ初期化できていない場合は再試行してから実行
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

// Google ポップアップ完了後のコールバック処理
async function handleCodeResponse(response) {
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

    // レスポンスが正常（200 OK）でない場合はテキストとしてログ出力
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