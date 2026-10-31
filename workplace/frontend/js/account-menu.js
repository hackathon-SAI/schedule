document.addEventListener("DOMContentLoaded", async () => {
  const menu = document.getElementById("accountMenu");
  if (!menu) return;

  const trigger = document.getElementById("accountMenuButton");
  const panel = document.getElementById("accountMenuPanel");
  const nameElement = document.getElementById("accountMenuName");
  const emailElement = document.getElementById("accountMenuEmail");
  const avatarInitial = document.getElementById("accountAvatarInitial");
  const avatarImage = document.getElementById("accountAvatarImage");
  const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";

  try {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      credentials: "include",
    });
    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }
    if (!response.ok) throw new Error("アカウント情報を取得できませんでした。");

    const data = await response.json();
    if (!data.user) throw new Error("アカウント情報の形式が正しくありません。");

    nameElement.textContent = data.user.name || "アカウント";
    emailElement.textContent = data.user.email || "";
    avatarInitial.textContent = (data.user.name || data.user.email || "?").trim().charAt(0).toUpperCase() || "?";
    trigger.setAttribute("aria-label", `${nameElement.textContent}のアカウントメニュー`);
    if (data.user.picture) {
      avatarImage.src = data.user.picture;
      avatarImage.hidden = false;
      avatarInitial.hidden = true;
      avatarImage.addEventListener("error", () => {
        avatarImage.hidden = true;
        avatarInitial.hidden = false;
      }, { once: true });
    }
  } catch (error) {
    console.error("アカウントメニューの初期化に失敗しました:", error);
    nameElement.textContent = "アカウント情報を取得できませんでした";
  }

  function closeMenu() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!isOpen));
    panel.hidden = isOpen;
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
    }
  });

  document.querySelectorAll("[data-account-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.accountAction;
      const isDelete = action === "delete";
      const isSwitch = action === "switch";
      const prompt = isDelete
        ? "会員登録を解除しますか？アカウント情報とあなたが作成した予定は削除され、元に戻せません。グループは残り、管理者権限は他のメンバーに引き継がれます。"
        : isSwitch
          ? "ログアウトして、別のGoogleアカウントでログインしますか？"
          : "ログアウトしますか？";
      if (!window.confirm(prompt)) return;

      button.disabled = true;
      try {
        const response = await fetch(
          isDelete ? `${baseUrl}/api/auth/me` : `${baseUrl}/api/auth/logout`,
          {
            method: isDelete ? "DELETE" : "POST",
            credentials: "include",
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || (isDelete
            ? "会員登録を解除できませんでした。"
            : "ログアウトできませんでした。"));
        }
        const nextPage = isSwitch ? "login.html?select_account=true" : "login.html";
        window.location.href = nextPage;
      } catch (error) {
        console.error("アカウント操作に失敗しました:", error);
        window.alert(error.message || "アカウント操作に失敗しました。");
        button.disabled = false;
      }
    });
  });
});
