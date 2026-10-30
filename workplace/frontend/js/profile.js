document.addEventListener("DOMContentLoaded", async () => {
  const nickname = document.getElementById("nickname");
  const userEmail = document.getElementById("userEmail");
  const userPicture = document.getElementById("userPicture");
  const nicknameForm = document.getElementById("nicknameForm");
  const saveButton = document.getElementById("saveNickname");
  const message = document.getElementById("profileMessage");
  let user;

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#d32f2f" : "#2e7d32";
  }

  function createAvatar(seed) {
    let hash = 2166136261;
    for (const character of seed) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }

    const hue = (hash >>> 0) % 360;
    const cells = [];
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        hash = Math.imul(hash ^ (row * 5 + column + 1), 16777619);
        if ((hash >>> 0) % 3 === 0) continue;
        const x = column === 2 ? column : 4 - column;
        cells.push(
          `<rect x="${x * 20 + 4}" y="${row * 20 + 4}" width="16" height="16" rx="5" fill="hsl(${(hue + row * 17 + column * 11) % 360} 78% 48%)"/>`
        );
        if (column < 2) {
          cells.push(
            `<rect x="${column * 20 + 4}" y="${row * 20 + 4}" width="16" height="16" rx="5" fill="hsl(${(hue + row * 17 + column * 11) % 360} 78% 48%)"/>`
          );
        }
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="28" fill="hsl(${hue} 75% 92%)"/>${cells.join("")}</svg>`;
    userPicture.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  try {
    user = await requireAuth();
    if (!user) return;

    nickname.value = user.name || "";
    userEmail.textContent = user.email || "Googleアカウント情報がありません";
    createAvatar(String(user.id || user.email || user.name));
  } catch (error) {
    console.error("Googleアカウント情報の表示に失敗しました:", error);
    setMessage("Googleアカウント情報を表示できませんでした。", true);
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
      const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
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
