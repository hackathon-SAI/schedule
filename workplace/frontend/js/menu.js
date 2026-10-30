
// =======================================
// menu.js
// メニューと一覧表示の管理
// =======================================

document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.getElementById("menuButton");
  const menuPanel = document.getElementById("menuPanel");

  const calendarButton = document.getElementById("calendarMenuButton");
  const taskButton = document.getElementById("taskMenuButton");
  const scheduleButton = document.getElementById("scheduleMenuButton");
  const logoutButton = document.getElementById("logoutButton");

  // 表示エリア（ビュー）要素の取得
  const calendarView = document.getElementById("calendarView");
  const taskView = document.getElementById("taskView");
  const scheduleView = document.getElementById("scheduleView");
  const shareView = document.getElementById("shareView");

  // メニュー開閉
  if (menuButton && menuPanel) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuPanel.classList.toggle("active");
      menuButton.setAttribute("aria-expanded", String(isOpen));
      menuButton.setAttribute(
        "aria-label",
        isOpen ? "メニューを閉じる" : "メニューを開く"
      );
    });
  }

  // 画面切り替え
  function switchView(targetView) {
    // すべてのビューを非表示
    const views = [
      calendarView,
      taskView,
      scheduleView,
      shareView
    ];

    views.forEach((view) => {
      if (view) view.style.display = "none";
    });

    // 対象のビューのみ表示
    if (targetView) {
      targetView.style.display = "block";
    }

    // メニューパネルを閉じる
    if (menuPanel) {
      menuPanel.classList.remove("active");
    }
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "メニューを開く");
    }
  }

  // カレンダー表示
  if (calendarButton) {
    calendarButton.addEventListener("click", () => {
      switchView(calendarView);

      if (window.calendar) {
        window.calendar.updateSize();
      }

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  }

  // 課題一覧表示
  if (taskButton) {
    taskButton.addEventListener("click", () => {
      switchView(taskView);
      displayTasks();
    });
  }

  // 予定一覧表示
  if (scheduleButton) {
    scheduleButton.addEventListener("click", () => {
      switchView(scheduleView);
      displaySchedules();
    });
  }

  // ログアウト
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      const result = confirm("ログアウトしますか？");
      if (!result) return;
    });
  }
})
