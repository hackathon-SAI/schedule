
// =======================================
// menu.js
// メニューと一覧表示の管理
// =======================================

document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.getElementById("menuButton");
  const menuPanel = document.getElementById("menuPanel");

  const shareButton = document.getElementById("shareMenuButton");
  const calendarButton = document.getElementById("calendarMenuButton");
  const taskButton = document.getElementById("taskMenuButton");
  const scheduleButton = document.getElementById("scheduleMenuButton");
  const profileButton = document.getElementById("profileMenuButton");
  const logoutButton = document.getElementById("logoutButton");

  const dashboard = document.querySelector(".dashboard");
  const taskPanel = document.getElementById("taskPanel");
  const schedulePanel = document.getElementById("schedulePanel");
  const groupPanel = document.getElementById("groupPanel");

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

  function showDashboardPanel(targetPanel = null) {
    if (dashboard) {
      dashboard.hidden = Boolean(targetPanel);
    }
    if (taskPanel) {
      taskPanel.hidden = targetPanel !== taskPanel;
    }
    if (schedulePanel) {
      schedulePanel.hidden = targetPanel !== schedulePanel;
    }
    if (groupPanel) {
      groupPanel.hidden = targetPanel !== groupPanel;
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

  if (shareButton) {
    shareButton.addEventListener("click", () => {
      showDashboardPanel(groupPanel);
    });
  }

  // カレンダー表示
  if (calendarButton) {
    calendarButton.addEventListener("click", () => {
      showDashboardPanel();

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
      showDashboardPanel(taskPanel);
      if (typeof loadTasks === "function") {
        loadTasks();
      }
    });
  }

  // 予定一覧表示
  if (scheduleButton) {
    scheduleButton.addEventListener("click", () => {
      showDashboardPanel(schedulePanel);
      displaySchedules();
    });
  }

  document.querySelectorAll(".closePanel").forEach((closeButton) => {
    closeButton.addEventListener("click", () => showDashboardPanel());
  });

  if (profileButton) {
    profileButton.addEventListener("click", () => {
      window.location.href = "profile.html";
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

async function displaySchedules() {
  const scheduleList = document.getElementById("scheduleList");
  if (!scheduleList) return;

  try {
    const events = await getGroupEvents();
    const schedules = events
      .filter((event) => (event.description || "").startsWith("[予定]"))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    scheduleList.replaceChildren();

    if (schedules.length === 0) {
      const message = document.createElement("p");
      message.textContent = "予定はありません。";
      scheduleList.appendChild(message);
      return;
    }

    schedules.forEach((schedule) => {
      const card = document.createElement("div");
      card.className = "schedule-card";

      const title = document.createElement("h3");
      title.textContent = schedule.title || "";
      card.appendChild(title);

      if (schedule.start_time) {
        const date = new Date(schedule.start_time);
        const dateText = document.createElement("p");
        dateText.textContent = `📅 ${date.toLocaleDateString("ja-JP", {
          timeZone: "Asia/Tokyo",
        })}`;
        card.appendChild(dateText);

        if (schedule.end_time) {
          const end = new Date(schedule.end_time);
          const timeText = document.createElement("p");
          timeText.textContent = `🕐 ${date.toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Tokyo",
          })} ～ ${end.toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Tokyo",
          })}`;
          card.appendChild(timeText);
        }
      }

      const description = (schedule.description || "").replace(/^\[予定\]\s*/, "");
      if (description) {
        const memo = document.createElement("p");
        memo.textContent = `📝 ${description}`;
        card.appendChild(memo);
      }

      scheduleList.appendChild(card);
    });
  } catch (error) {
    console.error("予定一覧の取得に失敗しました:", error);
    scheduleList.replaceChildren();
    const message = document.createElement("p");
    message.textContent = "予定一覧を読み込めませんでした。";
    scheduleList.appendChild(message);
  }
}
