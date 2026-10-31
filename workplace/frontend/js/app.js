
document.addEventListener("DOMContentLoaded", async () => {

  // カレンダー画面以外では実行しない
  const currentPage =
    window.location.pathname.split("/").pop();

  if (currentPage !== "calendar.html") {
    return;
  }

  // ログイン状態を確認
  const user = await requireAuth();

  // 未ログインなら処理を終了
  if (!user) {
    return;
  }

  // 認証成功後に画面を表示
  document.body.classList.add("authenticated");
  requestAnimationFrame(() => {
    if (window.calendar) {
      window.calendar.updateSize();
    }
  });

  // ユーザー名を表示（要素がある場合のみ）
  const userNameElement =
    document.getElementById("user-name");

  if (userNameElement) {
    userNameElement.textContent =
      `${user.name || user.email} さん`;
  }
});
