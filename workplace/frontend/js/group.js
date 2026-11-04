
// TokenStorage と buildAuthHeaders（common-auth.js で定義済み）
// ここではグローバル変数として参照可能
function weekendClassNames(date) {

// JWT トークンを含む認証ヘッダーを構築（Cookie が機能しない場合のフォールバック）
function buildAuthHeaders(extraHeaders = {}) {
  // 'token' キーを優先し、後方互換性のため 'jwt_token' も確認
  const token = (typeof TokenStorage !== 'undefined') ? TokenStorage.get() : (localStorage.getItem('token') || localStorage.getItem('jwt_token'));
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(date);
  return weekday === "Sun" ? ["is-sun"] : weekday === "Sat" ? ["is-sat"] : [];
}

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
  const groupChatMessages = document.getElementById("groupChatMessages");
  const groupChatStatus = document.getElementById("groupChatStatus");
  const groupChatForm = document.getElementById("groupChatForm");
  const groupChatInput = document.getElementById("groupChatInput");
  const groupChatSendButton = document.getElementById("groupChatSendButton");
  const calendarViewTab = document.getElementById("calendarViewTab");
  const calendarGroupTitle = document.getElementById("calendarGroupTitle");
  const calendarContainer = document.getElementById("groupCalendar");
  const createGroupForm = document.getElementById("createGroupForm");
  const joinGroupForm = document.getElementById("joinGroupForm");
  const createGroupButton = document.getElementById("createGroupButton");
  const joinGroupButton = document.getElementById("joinGroupButton");
  const joinGroupMessage = document.getElementById("joinGroupMessage");
  const copyInviteCodeButton = document.getElementById("copyInviteCode");
  const leaveGroupButton = document.getElementById("leaveGroupButton");

  // === カラー関連 & 管理者編集エレメントの取得 ===
  const groupColorPicker = document.getElementById("groupColor");
  const groupColorText = document.getElementById("groupColorText");
  const editGroupForm = document.getElementById("editGroupForm");
  const editGroupNameInput = document.getElementById("editGroupName");
  const editGroupColorPicker = document.getElementById("editGroupColor");
  const editGroupColorText = document.getElementById("editGroupColorText");
  const editGroupButton = document.getElementById("editGroupButton");
  const adminEditSection = document.getElementById("adminEditSection");

  let groups = [];
  let selectedGroupId = null;
  let selectedEvents = [];
  let calendar = null;
  let calendarScriptPromise = null;
  let selectionRequestId = 0;
  let currentUser;
  let chatPollTimer = null;
  let chatCursor = null;
  let chatRequestInProgress = false;
  const inappropriateChatTerms = [
    "死ね", "消えろ", "殺す", "きもい", "うざい", "ばか", "あほ",
    "くそ", "fuck", "shit", "bitch", "idiot",
  ];

  // === 1. カラーピッカーとテキスト入力の相互連動処理 ===
  function setupColorSync(picker, text) {
    if (!picker || !text) return;
    picker.addEventListener("input", (e) => {
      text.value = e.target.value;
    });
    text.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        picker.value = val;
      }
    });
  }

  setupColorSync(groupColorPicker, groupColorText);
  setupColorSync(editGroupColorPicker, editGroupColorText);

  try {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await window.EventActions.ready;
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
        `${window.API_BASE_URL || "http://localhost:5000"}${path}`,
        {
          ...options,
          signal: controller.signal,
          credentials: "include",
          headers: (typeof buildAuthHeaders === "function" ? buildAuthHeaders : (h) => h)({
            "Content-Type": "application/json",
            ...options.headers,
          }),
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
      redirectToLoginIfStillUnauthenticated();
      throw new Error("ログインの有効期限が切れています。再ログインしてください。");
    }
    if (!response.ok) {
      const error = new Error(data.error || data.message || "通信に失敗しました。");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setGroupMessage(text, isError = false) {
    if (groupMessage) {
      groupMessage.textContent = text;
      groupMessage.classList.toggle("error", isError);
    }
  }

  function setJoinGroupMessage(text, isError = false) {
    if (joinGroupMessage) {
      joinGroupMessage.textContent = text;
      joinGroupMessage.classList.toggle("error", isError);
    }
  }

  function setChatStatus(text, isError = false) {
    if (groupChatStatus) {
      groupChatStatus.textContent = text;
      groupChatStatus.classList.toggle("error", isError);
    }
  }

  function renderChatMessage(message) {
    const item = document.createElement("article");
    const isTaskMessage = message.message_type === "task";
    item.className = `group-chat-message${isTaskMessage ? " is-task" : String(message.sender_id) === String(currentUser.id) ? " is-mine" : ""}`;

    const sender = document.createElement("strong");
    sender.textContent = isTaskMessage ? "課題のお知らせ" : message.sender_name || "メンバー";
    item.appendChild(sender);

    const body = document.createElement("p");
    body.textContent = message.body;
    item.appendChild(body);

    const sentAt = new Date(message.created_at);
    const time = document.createElement("time");
    if (!Number.isNaN(sentAt.getTime())) {
      time.dateTime = sentAt.toISOString();
      time.textContent = sentAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    }
    item.appendChild(time);
    groupChatMessages.appendChild(item);
  }

  function stopChatPolling() {
    if (chatPollTimer !== null) {
      window.clearInterval(chatPollTimer);
      chatPollTimer = null;
    }
  }

  async function loadGroupChat(groupId, reset = false) {
    if (chatRequestInProgress) return;
    if (reset) {
      chatCursor = null;
      groupChatMessages.replaceChildren();
    }
    chatRequestInProgress = true;
    try {
      const cursor = chatCursor === null ? "" : `?afterId=${encodeURIComponent(chatCursor)}`;
      const data = await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/messages${cursor}`);
      if (String(groupId) !== selectedGroupId) return;
      if (!Array.isArray(data.messages)) throw new Error("チャット履歴の形式が正しくありません。");

      if (data.messages.length === 0 && reset) {
        const empty = document.createElement("p");
        empty.className = "group-chat-empty";
        empty.textContent = "まだメッセージはありません。課題を追加するか、最初のメッセージを送信しましょう。";
        groupChatMessages.appendChild(empty);
      } else {
        data.messages.forEach((message) => {
          groupChatMessages.querySelector(".group-chat-empty")?.remove();
          renderChatMessage(message);
          chatCursor = String(message.id);
        });
      }

      groupChatMessages.scrollTop = groupChatMessages.scrollHeight;
      setChatStatus("");
    } catch (error) {
      console.error("グループチャットの取得に失敗しました:", error);
      setChatStatus(error.message || "チャット履歴を取得できませんでした。", true);
    } finally {
      chatRequestInProgress = false;
    }
  }

  function startChatPolling(groupId) {
    stopChatPolling();
    chatPollTimer = window.setInterval(() => {
      if (!document.hidden && selectedGroupId === String(groupId)) {
        void loadGroupChat(groupId);
      }
    }, 5000);
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
    if (adminEditSection) adminEditSection.hidden = true;
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
      const name = group.group_name || group.name;
      button.textContent = name;
      button.setAttribute(
        "aria-current",
        String(String(group.id) === String(selectedGroupId))
      );
      button.addEventListener("click", () => selectGroup(group.id));
      item.appendChild(button);
      groupsList.appendChild(item);
    });
  }

  function renderEventSection(container, events, isTask, group) {
    container.replaceChildren();
    if (events.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = isTask ? "共有中の課題はありません。" : "共有中の予定はありません。";
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
      if (isTask) window.EventActions.appendAuditMetadata(card, event);
      window.EventActions.addControls(card, event, group.role);
      container.appendChild(card);
    });
  }

  function renderOverview(group, members, events) {
    groupEmptyState.hidden = true;
    groupOverview.hidden = false;
    const groupName = group.group_name || group.name || "グループ";
    groupTitle.textContent = groupName;
    const isAdmin = group.role === "admin" || group.role === "owner";
    groupRole.textContent = `あなたの権限：${isAdmin ? "管理者" : "メンバー"}`;
    groupInviteCode.textContent = `招待コード：${group.invite_code || "取得できませんでした"}`;
    calendarGroupTitle.textContent = `${groupName}のカレンダー`;
    calendarViewTab.disabled = false;

    // Admin/Owner の場合のみ編集フォームを表示
    if (adminEditSection) {
      adminEditSection.hidden = !isAdmin;
      if (isAdmin && editGroupNameInput && editGroupColorPicker) {
        editGroupNameInput.value = groupName;
        const colorVal = group.color || "#3b82f6";
        editGroupColorPicker.value = colorVal;
        if (editGroupColorText) editGroupColorText.value = colorVal;
      }
    }

    groupMembers.replaceChildren();
    members.forEach((member) => {
      const item = document.createElement("li");
      const memberRoleText = member.role === "admin" || member.role === "owner" ? "管理者" : "メンバー";
      item.textContent = `${member.name || member.email || "メンバー"}（${memberRoleText}）`;
      groupMembers.appendChild(item);
    });

    const tasks = events
      .filter((event) => (event.description || "").startsWith("[課題]"))
      .sort((a, b) => new Date(a.end_time) - new Date(b.end_time));
    const schedules = events
      .filter((event) => !(event.description || "").startsWith("[課題]"))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    renderEventSection(groupTasks, tasks, true, group);
    renderEventSection(groupSchedules, schedules, false, group);
  }

  async function selectGroup(groupId) {
    stopChatPolling();
    chatCursor = null;
    const requestId = ++selectionRequestId;
    const group = groups.find((item) => String(item.id) === String(groupId));
    if (!group) return;

    const groupName = group.group_name || group.name || "グループ";
    selectedGroupId = String(group.id);
    localStorage.setItem("selectedGroupId", selectedGroupId);
    localStorage.setItem("selectedGroupName", groupName);
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
      await loadGroupChat(group.id, true);
      startChatPolling(group.id);
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
      const scripts = [
        {
          path: "all/global.js",
          integrity: "sha384-mVUtG2TvolUSuFldYiRcYWx4EHK1XgqlFIyLMUf5alrN7/tdAzdvIbTnYQofzRSi"
        },
        {
          path: "themes/monarch/global.js",
          integrity: "sha384-eTZ1xQ830zvJLg5lC7bt4us60RagYcwVxE+8kcMNKWHv4wZZoBQ+rPpaQhACxYS1"
        },
        {
          path: "locales/ja/global.js",
          integrity: "sha384-mlBKD6Y1rhEpQrhyI2CYYFmIFsCxdGUL0lkz4oC92JshGhg7fhLckwAmegHErdA+"
        },
      ];
      calendarScriptPromise = scripts.reduce(
        (previous, { path, integrity }) => previous.then(() => new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `https://cdn.jsdelivr.net/npm/fullcalendar@7.1.2/${path}`;
          script.integrity = integrity;
          script.crossOrigin = "anonymous";
          script.onload = resolve;
          script.onerror = () => reject(new Error("カレンダーを読み込めませんでした。通信環境を確認してください。"));
          document.head.appendChild(script);
        })),
        Promise.resolve()
      ).catch((error) => {
        calendarScriptPromise = null;
        throw error;
      });
    }
    await calendarScriptPromise;
  }

  // === 2. カレンダー描画（グループカラー自動割り当て） ===
  function renderCalendarEvents() {
    if (!calendar) return;
    calendar.removeAllEvents();
    selectedEvents.forEach((event) => {
      // display_color -> group_color -> デフォルト色
      const color = event.display_color || event.group_color || ( (event.description || "").startsWith("[課題]") ? "#E53935" : "#4285F4" );
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
          themeSystem: "monarch",
          initialView: "dayGridMonth",
          height: "auto",
          dayMaxEventRows: true,
          nowIndicator: true,
          headerToolbar: {
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listWeek",
          },
          buttonText: {
            today: "今日",
            month: "月",
            week: "週",
            list: "リスト",
            listWeek: "週一覧",
          },
          dayCellClassNames: (info) => weekendClassNames(info.date),
          dayHeaderClassNames: (info) => weekendClassNames(info.date),
          eventClick: (info) => {
            window.EventActions.open(info.event.extendedProps, groups.find(
              (group) => String(group.id) === selectedGroupId
            )?.role);
          },
        });
        calendar.render();
      }
      renderCalendarEvents();
      window.requestAnimationFrame(() => calendar?.updateSize());
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

  // === 3. グループ作成（グループカラー指定対応） ===
  createGroupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("groupName").value.trim();
    const color = groupColorPicker ? groupColorPicker.value : "#3b82f6";

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
        body: JSON.stringify({ groupName: name, color }),
      });
      if (!data.group?.id) throw new Error("作成したグループ情報を取得できませんでした。");
      await loadGroups(data.group.id);
      setGroupMessage("グループを作成しました。");
      createGroupForm.reset();
      if (groupColorPicker) groupColorPicker.value = "#3b82f6";
      if (groupColorText) groupColorText.value = "#3b82f6";
    } catch (error) {
      console.error("グループ作成に失敗しました:", error);
      setGroupMessage(error.message || "グループを作成できませんでした。", true);
    } finally {
      createGroupButton.disabled = false;
      createGroupButton.textContent = "グループ作成";
    }
  });

  // === 4. グループ編集（管理者限定） ===
  if (editGroupForm) {
    editGroupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedGroupId) return;

      const groupName = editGroupNameInput.value.trim();
      const color = editGroupColorPicker ? editGroupColorPicker.value : "#3b82f6";

      if (!groupName || groupName.length > 50) {
        setGroupMessage("グループ名は1〜50文字で入力してください。", true);
        return;
      }

      editGroupButton.disabled = true;
      editGroupButton.textContent = "更新中...";
      setGroupMessage("グループ情報を更新しています...");

      try {
        const data = await apiRequest(`/api/groups/${encodeURIComponent(selectedGroupId)}`, {
          method: "PUT",
          body: JSON.stringify({ groupName, color }),
        });
        setGroupMessage(data.message || "グループ情報を更新しました。");
        await loadGroups(selectedGroupId);
      } catch (error) {
        console.error("グループ情報の更新に失敗しました:", error);
        setGroupMessage(error.message || "グループ情報を更新できませんでした。", true);
      } finally {
        editGroupButton.disabled = false;
        editGroupButton.textContent = "設定を保存";
      }
    });
  }

  joinGroupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const inviteCode = document.getElementById("inviteCode").value.trim().toUpperCase();
    if (!inviteCode) {
      setJoinGroupMessage("招待コードを入力してください。", true);
      return;
    }

    const existingGroup = groups.find(
      (group) => String(group.invite_code || "").toUpperCase() === inviteCode
    );
    if (existingGroup) {
      setJoinGroupMessage(`「${existingGroup.group_name || existingGroup.name}」にはすでに参加しています。`);
      return;
    }

    joinGroupButton.disabled = true;
    joinGroupButton.textContent = "参加中...";
    setJoinGroupMessage("グループに参加しています...");
    try {
      const data = await apiRequest("/api/groups/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      if (!data.group?.id) throw new Error("参加したグループ情報を取得できませんでした。");
      await loadGroups(data.group.id);
      setJoinGroupMessage(data.message || "グループに参加しました。");
      joinGroupForm.reset();
    } catch (error) {
      if (error.status === 409) {
        setJoinGroupMessage(error.message);
        return;
      }
      console.error("グループ参加に失敗しました:", error);
      setJoinGroupMessage(error.message || "グループに参加できませんでした。", true);
    } finally {
      joinGroupButton.disabled = false;
      joinGroupButton.textContent = "グループに参加";
    }
  });

  document.getElementById("inviteCode").addEventListener("input", () => {
    setJoinGroupMessage("");
  });

  groupChatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = groupChatInput.value.trim();
    if (!selectedGroupId || !text) return;

    const normalizedText = text.normalize("NFKC").toLowerCase().replace(/\s/g, "");
    if (inappropriateChatTerms.some((term) => normalizedText.includes(term))) {
      setChatStatus("不適切な表現が含まれているため、送信できません。", true);
      return;
    }

    groupChatSendButton.disabled = true;
    setChatStatus("送信しています...");
    try {
      const data = await apiRequest(`/api/groups/${encodeURIComponent(selectedGroupId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      if (!data.message?.id) throw new Error("送信したメッセージを取得できませんでした。");
      groupChatMessages.querySelector(".group-chat-empty")?.remove();
      renderChatMessage(data.message);
      chatCursor = String(data.message.id);
      groupChatMessages.scrollTop = groupChatMessages.scrollHeight;
      groupChatInput.value = "";
      setChatStatus("送信しました。");
    } catch (error) {
      console.error("グループチャットの送信に失敗しました:", error);
      setChatStatus(error.message || "メッセージを送信できませんでした。", true);
    } finally {
      groupChatSendButton.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && selectedGroupId) void loadGroupChat(selectedGroupId);
  });
  window.addEventListener("pagehide", stopChatPolling);

  window.addEventListener("event-changed", (event) => {
    if (String(event.detail?.groupId) === selectedGroupId) {
      selectGroup(selectedGroupId);
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

  // 招待コード再発行ボタンのイベントリスナー
  const rotateInviteCodeBtn = document.getElementById("rotateInviteCode");
  if (rotateInviteCodeBtn) {
    rotateInviteCodeBtn.addEventListener("click", async () => {
      const group = groups.find((item) => String(item.id) === selectedGroupId);
      if (!group) return;

      if (!confirm("招待コードを再発行しますか？新しいコードに置き換えられ、古いコードは無効になります。")) return;

      rotateInviteCodeBtn.disabled = true;
      rotateInviteCodeBtn.textContent = "再発行中...";
      try {
        const data = await apiRequest(`/api/groups/${group.id}/invite-code/rotate`, {
          method: "POST",
        });
        setGroupMessage("招待コードを再発行しました。");
        // グループ情報を再取得して表示を更新
        selectGroup(group.id);
      } catch (error) {
        console.error("招待コード再発行エラー:", error);
        setGroupMessage(error.message || "招待コードの再発行に失敗しました。", true);
      } finally {
        rotateInviteCodeBtn.disabled = false;
        rotateInviteCodeBtn.textContent = "招待コード再発行";
      }
    });
  }

  leaveGroupButton.addEventListener("click", async () => {
    const group = groups.find((item) => String(item.id) === selectedGroupId);
    if (!group) return;

    const groupName = group.group_name || group.name;
    const confirmed = window.confirm(
      `「${groupName}」から脱退しますか？最後のメンバーの場合、グループと共有予定も削除されます。`
    );
    if (!confirmed) return;

    leaveGroupButton.disabled = true;
    setGroupMessage("グループから脱退しています...");
    try {
      const data = await apiRequest(
        `/api/groups/${encodeURIComponent(group.id)}/leave`,
        { method: "DELETE" }
      );
      localStorage.removeItem("selectedGroupId");
      localStorage.removeItem("selectedGroupName");
      setGroupMessage(data.message || "グループから脱退しました。");
      await loadGroups();
    } catch (error) {
      console.error("グループ脱退に失敗しました:", error);
      setGroupMessage(error.message || "グループから脱退できませんでした。", true);
    } finally {
      leaveGroupButton.disabled = false;
    }
  });

  await loadGroups();
});