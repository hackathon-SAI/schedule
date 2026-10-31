document.addEventListener("DOMContentLoaded", async () => {
  const nickname = document.getElementById("nickname");
  const userEmail = document.getElementById("userEmail");
  const userPicture = document.getElementById("userPicture");
  const nicknameForm = document.getElementById("nicknameForm");
  const saveButton = document.getElementById("saveNickname");
  const message = document.getElementById("profileMessage");
  const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
  let user;

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#d32f2f" : "#2e7d32";
  }

  try {
    user = await requireAuth();
    if (!user) return;

    nickname.value = user.name || "";
    userEmail.textContent = user.email || "Googleアカウント情報がありません";
    if (user.picture) {
      userPicture.src = user.picture;
    } else {
      throw new Error("プロフィール画像が取得できませんでした。");
    }
  } catch (error) {
    console.error("アカウント情報の表示に失敗しました:", error);
    setMessage("アカウント情報を表示できませんでした。", true);
    return;
  }

  nicknameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nickname.value.trim();

    if (!name || name.length > 50) {
      setMessage("ニックネームは1〜50文字で入力してください。", true);
      return;
    }

    saveButton.disabled = true;
    setMessage("保存しています...");

    try {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html";
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || "ニックネームを保存できませんでした。");
      }

      user = data.user;
      nickname.value = user.name;
      setMessage("ニックネームを保存しました。");
    } catch (error) {
      console.error("ニックネームの保存に失敗しました:", error);
      setMessage(error.message || "ニックネームの保存に失敗しました。", true);
    } finally {
      saveButton.disabled = false;
    }
  });

});
