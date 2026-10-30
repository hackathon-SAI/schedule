document.addEventListener("DOMContentLoaded", async () => {
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");
  const userPicture = document.getElementById("userPicture");
  const message = document.getElementById("profileMessage");

  try {
    const user = await requireAuth();
    if (!user) return;

    userName.textContent = user.name || "名前は登録されていません";
    userEmail.textContent = user.email || "Googleアカウント情報がありません";

    if (user.picture) {
      try {
        const pictureUrl = new URL(user.picture);
        if (pictureUrl.protocol === "https:") {
          userPicture.src = pictureUrl.href;
          userPicture.hidden = false;
          userPicture.addEventListener("error", () => {
            userPicture.hidden = true;
          }, { once: true });
        }
      } catch (error) {
        console.warn("Googleアカウントの画像URLが不正です:", error);
      }
    }
  } catch (error) {
    console.error("Googleアカウント情報の表示に失敗しました:", error);
    message.textContent = "Googleアカウント情報を表示できませんでした。";
  }
});
