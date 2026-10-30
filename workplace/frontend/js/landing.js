document.addEventListener("DOMContentLoaded", async () => {
  const links = document.querySelectorAll("[data-auth-link]");

  try {
    const user = await checkAuth();
    if (!user) return;

    links.forEach((link) => {
      link.href = "calendar.html";
      link.textContent = "カレンダーへ";
    });
  } catch (error) {
    console.error("ログイン状態の確認に失敗しました:", error);
  }
});
