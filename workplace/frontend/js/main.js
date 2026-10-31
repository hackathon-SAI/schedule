const API_BASE_URL = window.API_BASE_URL;
document.addEventListener("DOMContentLoaded", async () => {
  // ログイン確認
  if (typeof requireAuth === "function") {
    const user = await requireAuth(API_BASE_URL);
    if (!user) return;
  }

  initializeApp();
});

// アプリ初期化
function initializeApp() {
  console.log("初期化完了");

  updateClock();
  setInterval(updateClock, 1000);

  // ダッシュボードを更新
  updateDashboard();

  // 30秒ごとに、ほかのメンバーが追加した予定・課題を確認
  setInterval(() => {
    updateDashboard();

    const taskPanel = document.getElementById("taskPanel");
    if (!taskPanel?.hidden && typeof loadTasks === "function") {
      loadTasks();
    }

    if (localStorage.getItem("selectedGroupId") && typeof updateCalendar === "function") {
      updateCalendar();
    }
  }, 30000);
}

// 時計を更新
function updateClock() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  const clock = document.getElementById("clock");

  if (clock) {
    clock.textContent =
      `${year}/${month}/${day} ${hour}:${minute}:${second}`;
  }
}

// ダッシュボードを更新
async function updateDashboard() {
  const groupId = localStorage.getItem("selectedGroupId");

  const todayTaskCountEl = document.getElementById("todayTaskCount");
  const highPriorityCountEl = document.getElementById("highPriorityCount");
  await updateAllTaskCount();

  if (!groupId) {
    if (todayTaskCountEl) todayTaskCountEl.textContent = "0";
    if (highPriorityCountEl) highPriorityCountEl.textContent = "0";
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/events?groupId=${encodeURIComponent(groupId)}`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (res.status === 401) {
      window.location.href = "login.html";
      return;
    }

    if (!res.ok) {
      console.error("ダッシュボードデータの取得に失敗しました");
      return;
    }

    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];

    const tasks = events.filter((event) =>
      (event.description || "").startsWith("[課題]")
    );

    // 今日が期限の課題
    const today = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Tokyo",
    });

    const todayEvents = tasks.filter((event) => {
      if (!event.end_time) return false;

      const deadline = new Date(event.end_time).toLocaleDateString("sv-SE", {
        timeZone: "Asia/Tokyo",
      });

      return deadline === today;
    });

    if (todayTaskCountEl) {
      todayTaskCountEl.textContent = todayEvents.length;
    }

    // 優先度「高」の件数
    const highPriority = tasks.filter(
      (event) =>
        event.priority === "高" ||
        (event.description &&
          event.description.includes("優先度:高"))
    );

    if (highPriorityCountEl) {
      highPriorityCountEl.textContent = highPriority.length;
    }
  } catch (err) {
    console.error("ダッシュボード更新エラー:", err);
  }
}

async function updateAllTaskCount() {
  const taskPanel = document.getElementById("taskPanel");
  if (taskPanel && !taskPanel.hidden) return;

  try {
    const tasks = await window.EventListFilters.getAllEvents("task");
    if (taskPanel && !taskPanel.hidden) return;
    const taskCount = document.getElementById("taskCount");
    if (taskCount) taskCount.textContent = String(tasks.length);
  } catch (error) {
    console.error("全グループの課題数を取得できませんでした:", error);
  }
}
