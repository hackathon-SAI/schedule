// APIベースURL
const API_BASE_URL = "https://schedule-backend-navy.vercel.app";

let codeClient;

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
    
    // 👇 ここを redirect に変更
    ux_mode: 'redirect',
    
    // 👇 認証完了後に戻ってくるページ（ご自身の login.html や専用のコールバック用URLなど）
    redirect_uri: 'https://schedule-sai.vercel.app/login.html',
  });
}

// ボタンクリック時はそのままリクエストを呼ぶだけで、自動的に画面が遷移します
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

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof redirectIfAuthenticated === 'function') {
    redirectIfAuthenticated(API_BASE_URL);
  }
  initGoogleAuth();

  // 👇 【重要】リダイレクトされて戻ってきたとき、URLに `code` が含まれているかチェックする
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (code) {
    // 戻ってきたので、バックエンドにコードを送信してログインを完了させる
    handleRedirectCode(code);
  }
});

// バックエンドへ認可コードを送信する関数
async function handleRedirectCode(code) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`バックエンド認証エラー (ステータス: ${res.status}):`, errorText);
      alert(`ログイン処理に失敗しました (Status: ${res.status})`);
      return;
    }

    // ログイン成功したらメイン画面へ
    window.location.href = 'https://schedule-sai.vercel.app/calendar.html';

  } catch (err) {
    console.error('通信エラー:', err);
    alert('サーバーとの通信に失敗しました');
  }
}