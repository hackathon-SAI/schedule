document.addEventListener("DOMContentLoaded", async () => {
  const groupsList = document.getElementById("groupsList");
  const groupsMessage = document.getElementById("groupsMessage");
  const groupMessage = document.getElementById("groupMessage");
  const calendarMessage = document.getElementById("calendarMessage");
  const groupEmptyState = document.getElementById("groupEmptyState");
  const groupOverview = document.getElementById("groupOverview");
  const groupTitle = document.getElementById("groupTitle");
  const groupRole = document.getElementById("groupRole");
  const groupInviteCode = document.getElementById("groupInviteCode");
  const groupMembers = document.getElementById("groupMembers");
  const groupTasks = document.getElementById("groupTasks");
  const groupSchedules = document.getElementById("groupSchedules");
  const calendarViewTab = document.getElementById("calendarViewTab");
  const calendarGroupTitle = document.getElementById("calendarGroupTitle");
  const calendarContainer = document.getElementById("groupCalendar");
  const createGroupForm = document.getElementById("createGroupForm");
  const joinGroupForm = document.getElementById("joinGroupForm");
  const createGroupButton = document.getElementById("createGroupButton");
  const joinGroupButton = document.getElementById("joinGroupButton");
  const copyInviteCodeButton = document.getElementById("copyInviteCode");

  let groups = [];
  let selectedGroupId = null;
  let selectedEvents = [];
  let calendar = null;
  let calendarScriptPromise = null;
  let selectionRequestId = 0;

  try {
    const user = await requireAuth();
    if (!user) return;
  } catch (error) {
    console.error("ログイン状態の確認に失敗しました:", error);
    groupsMessage.textContent = "ログイン状態を確認できませんでした。";
    return;
  }

  async function apiRequest(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 15000);

    let response;
    try {
      response = await fetch(
        `${window.API_BASE_URL || "https://schedule-backend-navy.vercel.app"}${path}`,
        {
          ...options,
          signal: controller.signal,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        }
      );
    } catch (error) {
      console.error(`グループAPI通信エラー (${path}):`, error);
      if (error.name === "AbortError") {
        throw new Error("通信がタイムアウトしました。もう一度お試しください。");
      }
      throw new Error("サーバーに接続できませんでした。通信環境を確認してください。");
    } finally {
      window.clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "login.html";
      throw new Error("ログインの有効期限が切れています。再ログインしてください。");
    }
    if (!response.ok) {
      throw new Error(data.error || data.message || "通信に失敗しました。");
    }
    return data;
  }

  function setGroupMessage(text, isError = false) {
    groupMessage.textContent = text;
    groupMessage.classList.toggle("error", isError);
  }

  function showEmptyState() {
    selectedGroupId = null;
    selectedEvents = [];
    groupEmptyState.hidden = false;
    groupOverview.hidden = true;
    calendarViewTab.disabled = true;
    groupTitle.textContent = "";
    groupRole.textContent = "";
    groupInviteCode.textContent = "";
    groupMembers.replaceChildren();
    groupTasks.replaceChildren();
    groupSchedules.replaceChildren();
    localStorage.removeItem("selectedGroupId");
    localStorage.removeItem("selectedGroupName");
  }

  function renderGroupList() {
    groupsList.replaceChildren();
    if (groups.length === 0) {
      groupsMessage.textContent = "まだグループに参加していません。作成するか、招待コードで参加してください。";
      return;
    }

    groupsMessage.textContent = `${groups.length}件のグループ`;
    groups.forEach((group) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = group.name;
      button.setAttribute(
        "aria-current",
        String(String(group.id) === String(selectedGroupId))
      );
      button.addEventListener("click", () => selectGroup(group.id));
      item.appendChild(button);
      groupsList.appendChild(item);
    });
  }

  function renderEventSection(container, events, isTask) {
    container.replaceChildren();
    if (events.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = isTask ? "共有中のタスクはありません。" : "共有中の予定はありません。";
      container.appendChild(empty);
      return;
    }

    events.forEach((event) => {
      const card = document.createElement("article");
      card.className = "shared-event-card";
      const title = document.createElement("h4");
      title.textContent = event.title || "名称未設定";
      card.appendChild(title);

      const dateValue = isTask ? event.end_time : event.start_time;
      if (dateValue) {
        const date = new Date(dateValue);
        const detail = document.createElement("p");
        detail.textContent = isTask
          ? `提出期限：${date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`
          : date.toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
        card.appendChild(detail);
      }

      const description = (event.description || "")
        .replace(/^\[(?:課題|予定)\]\s*/, "")
        .trim();
      if (description) {
        const detail = document.createElement("p");
        detail.textContent = description;
        card.appendChild(detail);
      }
      container.appendChild(card);
    });
  }

  function renderOverview(group, members, events) {
    groupEmptyState.hidden = true;
    groupOverview.hidden = false;
    groupTitle.textContent = group.name || "グループ";
    groupRole.textContent = `あなたの権限：${group.role === "admin" ? "管理者" : "メンバー"}`;
    groupInviteCode.textContent = `招待コード：${group.invite_code || "取得できませんでした"}`;
    calendarGroupTitle.textContent = `${group.name || "グループ"}のカレンダー`;
    calendarViewTab.disabled = false;

    groupMembers.replaceChildren();
    members.forEach((member) => {
      const item = document.createElement("li");
      item.textContent = `${member.name || member.email || "メンバー"}（${member.role === "admin" ? "管理者" : "メンバー"}）`;
      groupMembers.appendChild(item);
    });

    const tasks = events
      .filter((event) => (event.description || "").startsWith("[課題]"))
      .sort((a, b) => new Date(a.end_time) - new Date(b.end_time));
    const schedules = events
      .filter((event) => !(event.description || "").startsWith("[課題]"))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    renderEventSection(groupTasks, tasks, true);
    renderEventSection(groupSchedules, schedules, false);
  }

  async function selectGroup(groupId) {
    const requestId = ++selectionRequestId;
    const group = groups.find((item) => String(item.id) === String(groupId));
    if (!group) return;

    selectedGroupId = String(group.id);
    localStorage.setItem("selectedGroupId", selectedGroupId);
    localStorage.setItem("selectedGroupName", group.name || "グループ");
    renderGroupList();
    setGroupMessage("グループ情報を読み込んでいます...");

    try {
      const [detailData, eventData] = await Promise.all([
        apiRequest(`/api/groups/${encodeURIComponent(group.id)}`),
        apiRequest(`/api/groups/${encodeURIComponent(group.id)}/events`),
      ]);
      if (requestId !== selectionRequestId) return;
      if (!detailData.group || !Array.isArray(detailData.members) || !Array.isArray(eventData.events)) {
        throw new Error("グループ情報の形式が正しくありません。");
      }

      const selectedGroup = { ...group, ...detailData.group };
      selectedEvents = eventData.events;
      renderOverview(selectedGroup, detailData.members, selectedEvents);
      setGroupMessage("");
      if (calendar && !document.getElementById("calendarView").hidden) {
        renderCalendarEvents();
      }
    } catch (error) {
      if (requestId !== selectionRequestId) return;
      console.error("グループ概要の取得に失敗しました:", error);
      setGroupMessage(error.message || "グループ情報を読み込めませんでした。", true);
    }
  }

  async function loadGroups(preferredGroupId = null) {
    groupsMessage.textContent = "グループ一覧を読み込んでいます...";
    try {
      const data = await apiRequest("/api/groups");
      if (!Array.isArray(data.groups)) {
        throw new Error("グループ一覧の形式が正しくありません。");
      }
      groups = data.groups;
      const storedGroupId = localStorage.getItem("selectedGroupId");
      const wantedId = preferredGroupId || storedGroupId;
      const selected = groups.find((group) => String(group.id) === String(wantedId));
      const firstGroup = selected || groups[0];

      if (firstGroup) {
        selectedGroupId = String(firstGroup.id);
        renderGroupList();
        await selectGroup(firstGroup.id);
      } else {
        renderGroupList();
        showEmptyState();
      }
    } catch (error) {
      console.error("グループ一覧の取得に失敗しました:", error);
      groupsMessage.textContent = error.message || "グループ一覧を読み込めませんでした。";
    }
  }

  async function loadCalendarLibrary() {
    if (window.FullCalendar) return;
    if (!calendarScriptPromise) {
      calendarMessage.textContent = "カレンダーを読み込んでいます...";
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.18/index.global.min.css";
      document.head.appendChild(stylesheet);

      calendarScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.18/index.global.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("カレンダーを読み込めませんでした。通信環境を確認してください。"));
        document.head.appendChild(script);
      }).catch((error) => {
        calendarScriptPromise = null;
        throw error;
      });
    }
    await calendarScriptPromise;
  }

  function renderCalendarEvents() {
    if (!calendar) return;
    calendar.removeAllEvents();
    selectedEvents.forEach((event) => {
      const isTask = (event.description || "").startsWith("[課題]");
      const color = isTask ? "#E53935" : "#4285F4";
      calendar.addEvent({
        id: String(event.id),
        title: event.title || "名称未設定",
        start: event.start_time,
        end: event.end_time,
        backgroundColor: color,
        borderColor: color,
        extendedProps: event,
      });
    });
  }

  async function showCalendar() {
    if (!selectedGroupId) {
      calendarMessage.textContent = "先にグループを選択してください。";
      return;
    }
    try {
      await loadCalendarLibrary();
      if (!calendar) {
        calendar = new window.FullCalendar.Calendar(calendarContainer, {
          locale: "ja",
          timeZone: "Asia/Tokyo",
          initialView: "dayGridMonth",
          height: "auto",
          nowIndicator: true,
          headerToolbar: {
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          },
          buttonText: { today: "今日", month: "月", week: "週" },
        });
        calendar.render();
      }
      renderCalendarEvents();
      calendar.updateSize();
      calendarMessage.textContent = "";
    } catch (error) {
      console.error("グループカレンダーの表示に失敗しました:", error);
      calendarMessage.textContent = error.message || "カレンダーを表示できませんでした。";
    }
  }

  document.querySelectorAll("[data-view]").forEach((tab) => {
    tab.addEventListener("click", async () => {
      const showCalendarView = tab.dataset.view === "calendar";
      document.querySelectorAll("[data-view]").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.getElementById("overviewView").hidden = showCalendarView;
      document.getElementById("calendarView").hidden = !showCalendarView;
      if (showCalendarView) await showCalendar();
    });
  });

  createGroupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("groupName").value.trim();
    if (!name || name.length > 50) {
      setGroupMessage("グループ名は1〜50文字で入力してください。", true);
      return;
    }

    createGroupButton.disabled = true;
    createGroupButton.textContent = "作成中...";
    setGroupMessage("グループを作成しています...");
    try {
      const data = await apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (!data.group?.id) throw new Error("作成したグループ情報を取得できませんでした。");
      await loadGroups(data.group.id);
      setGroupMessage("グループを作成しました。");
      createGroupForm.reset();
    } catch (error) {
      console.error("グループ作成に失敗しました:", error);
      setGroupMessage(error.message || "グループを作成できませんでした。", true);
    } finally {
      createGroupButton.disabled = false;
      createGroupButton.textContent = "グループ作成";
    }
  });

  joinGroupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const inviteCode = document.getElementById("inviteCode").value.trim();
    if (!inviteCode) {
      setGroupMessage("招待コードを入力してください。", true);
      return;
    }

    joinGroupButton.disabled = true;
    joinGroupButton.textContent = "参加中...";
    setGroupMessage("グループに参加しています...");
    try {
      const data = await apiRequest("/api/groups/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      if (!data.group?.id) throw new Error("参加したグループ情報を取得できませんでした。");
      await loadGroups(data.group.id);
      setGroupMessage(data.message || "グループに参加しました。");
      joinGroupForm.reset();
    } catch (error) {
      console.error("グループ参加に失敗しました:", error);
      setGroupMessage(error.message || "グループに参加できませんでした。", true);
    } finally {
      joinGroupButton.disabled = false;
      joinGroupButton.textContent = "グループに参加";
    }
  });

  copyInviteCodeButton.addEventListener("click", async () => {
    const code = groups.find((group) => String(group.id) === selectedGroupId)?.invite_code;
    if (!code) {
      setGroupMessage("招待コードを取得できませんでした。", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setGroupMessage("招待コードをコピーしました。");
    } catch (error) {
      console.error("招待コードのコピーに失敗しました:", error);
      setGroupMessage(`招待コード：${code}（手動でコピーしてください）`);
    }
  });

  await loadGroups();
});
