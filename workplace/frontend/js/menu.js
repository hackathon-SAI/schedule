
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
  const googleIntegrationsButton = document.getElementById("googleIntegrationsMenuButton");
  const googleIntegrations = document.getElementById("googleIntegrations");
  const taskPanel = document.getElementById("taskPanel");
  const schedulePanel = document.getElementById("schedulePanel");

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
    if (taskPanel) {
      taskPanel.hidden = targetPanel !== taskPanel;
    }
    if (schedulePanel) {
      schedulePanel.hidden = targetPanel !== schedulePanel;
    }
    if (googleIntegrations) {
      googleIntegrations.hidden = targetPanel !== googleIntegrations;
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
      window.location.href = "group.html";
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

  if (googleIntegrationsButton && googleIntegrations) {
    googleIntegrationsButton.addEventListener("click", () => {
      showDashboardPanel(googleIntegrations);
      googleIntegrations.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  document.querySelectorAll(".closePanel").forEach((closeButton) => {
    closeButton.addEventListener("click", () => showDashboardPanel());
  });

})

async function displaySchedules() {
  const scheduleList = document.getElementById("scheduleList");
  if (!scheduleList) return;

  try {
    const schedules = await window.EventListFilters.getEvents("schedule");

    scheduleList.replaceChildren();

    if (schedules.length === 0) {
      const message = document.createElement("p");
      message.textContent = window.EventListFilters.selectedGroupCount("schedule") === 0
        ? "表示するグループを選択してください。"
        : "予定はありません。";
      scheduleList.appendChild(message);
      return;
    }

    schedules.forEach((schedule) => {
      const card = document.createElement("div");
      card.className = "schedule-card";

      const title = document.createElement("h3");
      title.textContent = schedule.title || "";
      card.appendChild(title);

      const group = document.createElement("p");
      group.className = "event-list-group-name";
      group.textContent = `👥 ${schedule.group_name || "グループ不明"}`;
      card.appendChild(group);

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

      window.EventActions.addControls(card, schedule);
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

document.addEventListener("DOMContentLoaded", () => {
  window.EventListFilters.initialize(
    "schedule",
    "scheduleListFilters",
    displaySchedules
  ).catch((error) => {
    console.error("予定一覧フィルターの初期化に失敗しました:", error);
    const scheduleList = document.getElementById("scheduleList");
    if (scheduleList) {
      scheduleList.replaceChildren();
      const message = document.createElement("p");
      message.textContent = "グループ一覧を読み込めませんでした。";
      scheduleList.appendChild(message);
    }
  });
});
