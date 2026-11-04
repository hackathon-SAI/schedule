
// TokenStorage と buildAuthHeaders（common-auth.js で定義済み）
// ここではグローバル変数として参照可能

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

(() => {
  const tokenKey = "demoSessionToken";
  const stateKey = "studyPlannerDemoModeState";
  const navigationKey = "studyPlannerDemoNavigation";
  const demoPages = new Set(["calendar.html", "group.html", "demo.html"]);
  const token = sessionStorage.getItem(tokenKey);
  const pageName = window.location.pathname.split("/").pop();
  if (!token || !demoPages.has(pageName)) return;

  const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
  const backendOrigin = new URL(baseUrl, window.location.href).origin;
  const nativeFetch = window.fetch.bind(window);
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const internalNavigation = sessionStorage.getItem(navigationKey) === "1";
  sessionStorage.removeItem(navigationKey);
  if (navigationEntry?.type === "reload" || !internalNavigation) {
    sessionStorage.removeItem(stateKey);
  }

  const state = {
    events: [],
    groups: [],
    hiddenGroupIds: [],
    messages: [],
    nextEventId: 0,
    nextGroupId: 0,
    nextMessageId: 0,
    sentMessageCount: 0,
  };
  const savedState = sessionStorage.getItem(stateKey);
  if (internalNavigation && savedState) {
    try {
      const restored = JSON.parse(savedState);
      if (
        Array.isArray(restored.events) &&
        Array.isArray(restored.groups) &&
        Array.isArray(restored.hiddenGroupIds) &&
        Array.isArray(restored.messages) &&
        Number.isSafeInteger(restored.nextEventId) &&
        Number.isSafeInteger(restored.nextGroupId) &&
        Number.isSafeInteger(restored.nextMessageId) &&
        Number.isSafeInteger(restored.sentMessageCount) &&
        restored.sentMessageCount >= 0
      ) {
        Object.assign(state, restored);
      } else {
        throw new Error("デモ一時データの形式が正しくありません。");
      }
    } catch (error) {
      console.error("デモ一時データを復元できませんでした:", error);
      sessionStorage.removeItem(stateKey);
    }
  }

  const events = state.events;
  const virtualGroups = state.groups;
  let groups = [];
  let user = null;
  let navigatingWithinDemo = false;
  let exiting = false;

  window.DemoMode = {
    active: true,
    canManage: (event) => String(event.id || "").startsWith("demo-ephemeral-"),
    expire: () => restoreGroupSelection(),
    prepareNavigation: ({ resetState = false } = {}) => {
      if (resetState) sessionStorage.removeItem(stateKey);
      navigatingWithinDemo = true;
      sessionStorage.setItem(navigationKey, "1");
    },
  };

  if (!sessionStorage.getItem("demoPreviousGroup")) {
    const previousGroup = {
      id: internalNavigation ? null : localStorage.getItem("selectedGroupId"),
      name: internalNavigation ? null : localStorage.getItem("selectedGroupName"),
    };
    sessionStorage.setItem("demoPreviousGroup", JSON.stringify(previousGroup));
  }
  if (!internalNavigation) {
    localStorage.removeItem("selectedGroupId");
    localStorage.removeItem("selectedGroupName");
  }

  function persistState() {
    sessionStorage.setItem(stateKey, JSON.stringify(state));
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  function isBackendRequest(input) {
    const url = input instanceof Request ? input.url : String(input);
    try {
      return new URL(url, window.location.href).origin === backendOrigin;
    } catch {
      return false;
    }
  }

  async function requestBody(input, init) {
    if (init?.body && typeof init.body === "string") return JSON.parse(init.body);
    if (input instanceof Request) return input.clone().json();
    return {};
  }

  function makeHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set("Authorization", `Bearer ${sessionStorage.getItem(tokenKey) || ""}`);
    return headers;
  }

  function eventGroupName(groupId) {
    return groups.find((group) => String(group.id) === String(groupId))?.name || "グループ";
  }

  function addMemoryMessage(groupId, body, messageType = "message") {
    const message = {
      id: ++state.nextMessageId,
      group_id: String(groupId),
      sender_id: user?.id,
      sender_name: user?.name || "デモユーザー",
      body,
      message_type: messageType,
      created_at: new Date().toISOString(),
    };
    state.messages.push(message);
    persistState();
    return message;
  }

  function addMemoryEvent(body) {
    const groupId = String(body.group_id);
    const event = {
      id: `demo-ephemeral-${++state.nextEventId}`,
      group_id: groupId,
      group_name: eventGroupName(groupId),
      created_by: user?.id,
      creator_name: user?.name || "デモユーザー",
      created_at: new Date().toISOString(),
      updated_by: user?.id,
      editor_name: user?.name || "デモユーザー",
      updated_at: new Date().toISOString(),
      title: String(body.title || ""),
      description: body.description || "",
      start_time: body.start_time,
      end_time: body.end_time,
      subject: body.subject ?? null,
      subject_color: body.subject_color ?? null,
    };
    events.push(event);
    if (String(event.description).startsWith("[課題]")) {
      const deadline = event.end_time
        ? new Date(event.end_time).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
        : "未設定";
      addMemoryMessage(groupId, `課題「${event.title}」を追加しました（提出期限：${deadline}）。`, "task");
    }
    persistState();
    return event;
  }

  function findVirtualGroup(groupId) {
    return virtualGroups.find((group) => String(group.id) === String(groupId));
  }

  function groupEvents(groupId) {
    const virtualGroup = findVirtualGroup(groupId);
    return [
      ...(virtualGroup?.events || []),
      ...events.filter((event) => String(event.group_id) === String(groupId)),
    ];
  }

  function groupById(groupId) {
    return groups.find((group) => String(group.id) === String(groupId)) ||
      findVirtualGroup(groupId);
  }

  function makeVirtualGroup(name, inviteCode, members, originalGroup = null, eventsForGroup = []) {
    const group = {
      id: `demo-group-${++state.nextGroupId}`,
      name,
      invite_code: inviteCode,
      role: "admin",
      created_by: user?.id,
      members,
      events: eventsForGroup.map((event) => ({
        ...event,
        group_id: `demo-group-${state.nextGroupId}`,
        group_name: name,
      })),
      ...(originalGroup ? { original_group_id: originalGroup.id } : {}),
    };
    virtualGroups.push(group);
    groups.push(group);
    persistState();
    return group;
  }

  function responseWithEvents(response, addedEvents) {
    return response.clone().json().then((data) => {
      if (!Array.isArray(data.events)) return response;
      return jsonResponse({ ...data, events: [...data.events, ...addedEvents] }, response.status);
    });
  }

  async function joinGroup(inviteCode) {
    const existing = groups.find(
      (group) => String(group.invite_code || "").toUpperCase() === inviteCode
    );
    if (existing) return jsonResponse({ error: `「${existing.name}」にはすでに参加しています` }, 409);

    const sessionGroup = virtualGroups.find(
      (group) => String(group.invite_code || "").toUpperCase() === inviteCode
    );
    if (sessionGroup) {
      return jsonResponse({ error: `「${sessionGroup.name}」にはすでに参加しています` }, 409);
    }

    const previewResponse = await nativeFetch(
      `${baseUrl}/api/demo/groups/invite/${encodeURIComponent(inviteCode)}`,
      { headers: buildAuthHeaders(), credentials: "include", cache: "no-store", headers: makeHeaders(null, {}) }
    );
    const preview = await previewResponse.json().catch(() => ({}));
    if (!previewResponse.ok) {
      return jsonResponse({ error: preview.error || "招待コードが見つからないか、デモでは参加できないグループです。" }, previewResponse.status);
    }
    if (!preview.group || !Array.isArray(preview.members) || !Array.isArray(preview.events)) {
      return jsonResponse({ error: "グループ情報の形式が正しくありません。" }, 502);
    }

    const members = preview.members.map((member) => ({
      ...member,
      role: String(member.id) === String(user?.id) ? "member" : member.role,
    }));
    if (!members.some((member) => String(member.id) === String(user?.id))) {
      members.push({
        id: user?.id,
        name: user?.name || "デモユーザー",
        email: user?.email,
        role: "member",
      });
    }
    const group = makeVirtualGroup(
      preview.group.name,
      preview.group.invite_code,
      members,
      preview.group,
      preview.events
    );
    group.role = "member";
    return jsonResponse({ message: "デモ中のみグループに参加しました。", group }, 201);
  }

  window.fetch = async (input, init = {}) => {
    if (!isBackendRequest(input)) return nativeFetch(input, init);

    const requestUrl = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const pathname = requestUrl.pathname;

    // /api/auth/me をデモモードで処理
    if (pathname === "/api/auth/me" && method === "GET") {
      return jsonResponse({
        user: {
          id: user?.id || 0,
          email: user?.email || "demo@demo.local",
          name: user?.name || "デモユーザー",
          mode: "demo",
        }
      });
    }

    if (pathname === "/api/events" && method === "POST") {
      try {
        const event = addMemoryEvent(await requestBody(input, init));
        return jsonResponse({ message: "デモ中のみ表示するデータを追加しました", event }, 201);
      } catch (error) {
        console.error("デモ課題・予定の追加に失敗しました:", error);
        return jsonResponse({ error: "入力内容を読み取れませんでした。" }, 400);
      }
    }

    if (pathname === "/api/events" && method === "GET") {
      const groupId = requestUrl.searchParams.get("groupId");
      if (groupId && findVirtualGroup(groupId)) {
        return jsonResponse({ events: groupEvents(groupId) });
      }
    }

    const ephemeralEventMatch = pathname.match(/^\/api\/events\/(demo-ephemeral-\d+)$/);
    if (ephemeralEventMatch && method === "PUT") {
      const event = events.find((item) => item.id === ephemeralEventMatch[1]);
      if (!event) return jsonResponse({ error: "予定・課題が見つかりません。" }, 404);
      try {
        const body = await requestBody(input, init);
        const updatedEvent = {
          ...event,
          title: typeof body.title === "string" ? body.title.trim() : event.title,
          description: typeof body.description === "string" ? body.description : event.description,
          start_time: typeof body.start_time === "string" ? body.start_time : event.start_time,
          end_time: typeof body.end_time === "string" ? body.end_time : event.end_time,
          subject: body.subject ?? event.subject,
          subject_color: body.subject_color ?? event.subject_color,
        };
        const startTime = Date.parse(updatedEvent.start_time);
        const endTime = Date.parse(updatedEvent.end_time);
        if (
          !updatedEvent.title ||
          !Number.isFinite(startTime) ||
          !Number.isFinite(endTime) ||
          endTime <= startTime
        ) {
          return jsonResponse({ error: "タイトルと正しい日時を入力してください。" }, 400);
        }
        updatedEvent.updated_by = user?.id;
        updatedEvent.editor_name = user?.name || "デモユーザー";
        updatedEvent.updated_at = new Date().toISOString();
        Object.assign(event, updatedEvent);
        persistState();
        return jsonResponse({ message: "デモ中のみ表示するデータを更新しました。", event });
      } catch (error) {
        console.error("デモ課題・予定の更新に失敗しました:", error);
        return jsonResponse({ error: "入力内容を読み取れませんでした。" }, 400);
      }
    }

    if (pathname === "/api/groups" && method === "POST") {
      try {
        const body = await requestBody(input, init);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 50) {
          return jsonResponse({ error: "グループ名は1〜50文字で入力してください" }, 400);
        }
        const inviteCode = `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const group = makeVirtualGroup(name, inviteCode, [{
          id: user?.id,
          name: user?.name || "デモユーザー",
          email: user?.email,
          role: "admin",
        }]);
        return jsonResponse({ group }, 201);
      } catch (error) {
        console.error("デモグループの作成に失敗しました:", error);
        return jsonResponse({ error: "グループを作成できませんでした。" }, 400);
      }
    }

    if (pathname === "/api/groups/join" && method === "POST") {
      try {
        const body = await requestBody(input, init);
        const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
        if (!inviteCode) return jsonResponse({ error: "招待コードを入力してください" }, 400);
        return joinGroup(inviteCode);
      } catch (error) {
        console.error("デモでのグループ参加に失敗しました:", error);
        return jsonResponse({ error: "グループに参加できませんでした。" }, 400);
      }
    }

    const leaveMatch = pathname.match(/^\/api\/groups\/([^/]+)\/leave$/);
    if (leaveMatch && method === "DELETE") {
      const groupId = decodeURIComponent(leaveMatch[1]);
      const group = groupById(groupId);
      if (!group) return jsonResponse({ error: "グループが見つかりません。" }, 404);
      if (findVirtualGroup(groupId)) {
        state.groups = virtualGroups.filter((item) => String(item.id) !== groupId);
        state.events = events.filter((event) => String(event.group_id) !== groupId);
        state.messages = state.messages.filter((message) => String(message.group_id) !== groupId);
        groups = groups.filter((item) => String(item.id) !== groupId);
      } else if (!state.hiddenGroupIds.includes(groupId)) {
        state.hiddenGroupIds.push(groupId);
        groups = groups.filter((item) => String(item.id) !== groupId);
      }
      persistState();
      return jsonResponse({ message: "デモ中のみグループから脱退しました。" });
    }

    const groupMessageMatch = pathname.match(/^\/api\/groups\/([^/]+)\/messages$/);
    if (groupMessageMatch) {
      const groupId = decodeURIComponent(groupMessageMatch[1]);
      const group = groupById(groupId);
      if (!group) return jsonResponse({ error: "グループが見つかりません。" }, 404);
      if (method === "GET") {
        const afterId = Number(requestUrl.searchParams.get("afterId") || 0);
        const messages = state.messages.filter((message) =>
          String(message.group_id) === groupId && Number(message.id) > afterId
        );
        return jsonResponse({ messages });
      }
      if (method === "POST") {
        try {
          const body = await requestBody(input, init);
          const text = typeof body.body === "string" ? body.body.trim() : "";
          if (!text || text.length > 500) {
            return jsonResponse({ error: "メッセージは1〜500文字で入力してください" }, 400);
          }
          if (state.sentMessageCount >= 10) {
            return jsonResponse({ error: "デモでは1セッションあたり10通まで送信できます。" }, 429);
          }
          const message = addMemoryMessage(groupId, text);
          state.sentMessageCount += 1;
          persistState();
          return jsonResponse({ message }, 201);
        } catch (error) {
          console.error("デモチャットの送信に失敗しました:", error);
          return jsonResponse({ error: "メッセージを送信できませんでした。" }, 400);
        }
      }
    }

    const virtualGroupMatch = pathname.match(/^\/api\/groups\/([^/]+)(?:\/(events))?$/);
    if (virtualGroupMatch && findVirtualGroup(decodeURIComponent(virtualGroupMatch[1]))) {
      const groupId = decodeURIComponent(virtualGroupMatch[1]);
      const group = findVirtualGroup(groupId);
      if (method === "GET" && !virtualGroupMatch[2]) {
        return jsonResponse({ group, members: group.members || [] });
      }
      if (method === "GET" && virtualGroupMatch[2] === "events") {
        return jsonResponse({ events: groupEvents(groupId) });
      }
    }

    if (
      method !== "GET" &&
      !pathname.startsWith("/api/demo/") &&
      pathname !== "/api/auth/logout"
    ) {
      return jsonResponse({ error: "デモの変更はこのセッション内だけに保存されます。" }, 403);
    }

    let response;
    try {
      response = await nativeFetch(input, { ...init, headers: makeHeaders(input, init) });
    } catch (error) {
      console.error("デモAPIへの接続に失敗しました:", error);
      throw error;
    }

    if (response.status === 401 && !pathname.startsWith("/api/demo/")) {
      restoreGroupSelection();
      return response;
    }

    if (pathname === "/api/auth/me" && response.ok) {
      try {
        user = (await response.clone().json()).user;
        const badgeLabel = document.querySelector("#demoModeBadge span");
        if (badgeLabel && user?.name) badgeLabel.textContent = `デモ：${user.name}`;
      } catch (error) {
        console.error("デモユーザー情報の読み込みに失敗しました:", error);
      }
    }

    if (pathname === "/api/groups" && method === "GET" && response.ok) {
      try {
        const data = await response.clone().json();
        if (!Array.isArray(data.groups)) throw new Error("グループ一覧の形式が正しくありません。");
        const realGroups = data.groups.filter(
          (group) => !state.hiddenGroupIds.includes(String(group.id))
        );
        groups = [...realGroups, ...virtualGroups];
        const selectedGroup = groups.find(
          (group) => String(group.id) === localStorage.getItem("selectedGroupId")
        ) || groups[0];
        if (selectedGroup) {
          localStorage.setItem("selectedGroupId", String(selectedGroup.id));
          localStorage.setItem("selectedGroupName", selectedGroup.name || "グループ");
        }
        if (typeof updateCalendar === "function") updateCalendar();
        if (typeof updateDashboard === "function") updateDashboard();
        return jsonResponse({ ...data, groups });
      } catch (error) {
        console.error("デモのグループ一覧を構成できませんでした:", error);
        return jsonResponse({ error: "グループ一覧を表示できませんでした。" }, 502);
      }
    }

    const groupDetailMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (groupDetailMatch && method === "GET" && response.ok) {
      const groupId = decodeURIComponent(groupDetailMatch[1]);
      const group = groups.find((item) => String(item.id) === groupId);
      if (group && findVirtualGroup(groupId)) {
        return jsonResponse({ group, members: group.members || [] });
      }
    }

    if (pathname === "/api/events" && method === "GET" && response.ok) {
      const groupId = requestUrl.searchParams.get("groupId");
      const addedEvents = events.filter((event) => String(event.group_id) === groupId);
      if (addedEvents.length > 0) return responseWithEvents(response, addedEvents);
    }

    const groupEventsMatch = pathname.match(/^\/api\/groups\/([^/]+)\/events$/);
    if (groupEventsMatch && method === "GET") {
      const groupId = decodeURIComponent(groupEventsMatch[1]);
      if (findVirtualGroup(groupId)) return jsonResponse({ events: groupEvents(groupId) });
      if (response.ok) {
        const addedEvents = events.filter((event) => String(event.group_id) === groupId);
        if (addedEvents.length > 0) return responseWithEvents(response, addedEvents);
      }
    }

    return response;
  };

  function restoreGroupSelection() {
    if (exiting) return;
    exiting = true;
    try {
      const previous = JSON.parse(sessionStorage.getItem("demoPreviousGroup") || "{}");
      if (previous.id) localStorage.setItem("selectedGroupId", previous.id);
      else localStorage.removeItem("selectedGroupId");
      if (previous.name) localStorage.setItem("selectedGroupName", previous.name);
      else localStorage.removeItem("selectedGroupName");
    } catch (error) {
      console.error("通常モードのグループ選択を復元できませんでした:", error);
    }
    sessionStorage.removeItem("demoPreviousGroup");
    sessionStorage.removeItem(stateKey);
    sessionStorage.removeItem(tokenKey);
    window.location.replace("index.html");
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;

    const destination = new URL(link.href, window.location.href);
    const fileName = destination.pathname.split("/").pop() || "";
    if (destination.origin === window.location.origin && demoPages.has(fileName)) {
      navigatingWithinDemo = true;
      sessionStorage.setItem(navigationKey, "1");
    }
  }, true);

  window.addEventListener("pagehide", () => {
    if (navigatingWithinDemo) persistState();
    else sessionStorage.removeItem(stateKey);
  });

  document.addEventListener("DOMContentLoaded", async () => {
    document.body.classList.add("demo-mode");
    const badge = document.getElementById("demoModeBadge");
    if (badge) badge.hidden = false;

    // デモモード中のユーザー名をバッジに表示
    const personaNameEl = document.getElementById("demoPersonaName");
    if (personaNameEl) {
      try {
        const meResponse = await nativeFetch(`${baseUrl}/api/demo/me`, {
          method: "GET",
          credentials: "include",
          headers: makeHeaders(null, {}),
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          if (meData.user?.name) {
            personaNameEl.textContent = `（${meData.user.name}）`;
          }
        }
      } catch (error) {
        console.error("デモユーザー情報の取得に失敗しました:", error);
      }
    }

    document.getElementById("demoModeExitButton")?.addEventListener("click", async () => {
      const button = document.getElementById("demoModeExitButton");
      if (button) button.disabled = true;
      try {
        const response = await nativeFetch(`${baseUrl}/api/demo/sessions/current`, {
          method: "DELETE",
          credentials: "include",
          headers: makeHeaders(null, {}),
        });
        if (!response.ok) throw new Error(`デモセッションの終了に失敗しました (${response.status})`);
      } catch (error) {
        console.error("デモセッションの終了通知に失敗しました:", error);
        const status = document.getElementById("demoStatus") ||
          document.getElementById("calendarStatus") ||
          document.getElementById("groupMessage");
        if (status) {
          status.textContent = error instanceof Error
            ? error.message
            : "デモを終了できませんでした。通信環境を確認してください。";
        }
      } finally {
        if (button) button.disabled = false;
        restoreGroupSelection();
      }
    });
  });
})();
