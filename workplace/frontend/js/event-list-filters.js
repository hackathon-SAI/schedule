window.EventListFilters = (() => {
  const states = new Map();
  let groups = [];
  let currentUserId = null;
  let initialization;

  function apiBaseUrl() {
    return window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
  }

  async function loadMetadata() {
    const [groupsResponse, userResponse] = await Promise.all([
      fetch(`${apiBaseUrl()}/api/groups`, { credentials: "include" }),
      fetch(`${apiBaseUrl()}/api/auth/me`, { credentials: "include" }),
    ]);

    if (groupsResponse.status === 401 || userResponse.status === 401) {
      window.location.href = "login.html";
      throw new Error("ログインの有効期限が切れています。再ログインしてください。");
    }
    if (!groupsResponse.ok || !userResponse.ok) {
      throw new Error("グループまたはアカウント情報を読み込めませんでした。");
    }

    const [groupsData, userData] = await Promise.all([
      groupsResponse.json(),
      userResponse.json(),
    ]);
    if (
      !Array.isArray(groupsData.groups) ||
      !userData.user ||
      userData.user.id === null ||
      userData.user.id === undefined
    ) {
      throw new Error("グループまたはアカウント情報の形式が正しくありません。");
    }

    groups = groupsData.groups;
    currentUserId = userData.user.id;
  }

  function createSelect(className, ariaLabel, choices) {
    const select = document.createElement("select");
    select.className = className;
    select.setAttribute("aria-label", ariaLabel);

    choices.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    return select;
  }

  function addSelectControl(root, labelText, className, ariaLabel, choices) {
    const select = createSelect(className, ariaLabel, choices);
    const label = document.createElement("label");
    label.className = "event-list-sort-label";
    label.append(`${labelText} `, select);
    root.appendChild(label);
    return select;
  }

  function initialize(kind, controlsId, onChange) {
    const root = document.getElementById(controlsId);
    if (!root) return Promise.resolve();

    const groupContainer = root.querySelector(".event-list-groups");
    const ownInput = root.querySelector(".event-list-own");
    const sortSelect = addSelectControl(
      root,
      "並び順",
      "event-list-sort",
      "並び順",
      kind === "task"
        ? [
            ["date-asc", "期限が近い順"],
            ["date-desc", "期限が遅い順"],
          ]
        : [
            ["date-asc", "開始日時が近い順"],
            ["date-desc", "開始日時が遅い順"],
          ]
    );
    const prioritySelect = kind === "task"
      ? addSelectControl(root, "優先順位", "event-list-priority", "優先順位で絞り込み", [
          ["all", "すべて"],
          ["high", "高"],
          ["medium", "中"],
          ["low", "低"],
          ["unset", "未設定"],
        ])
      : null;

    const state = { groupContainer, ownInput, sortSelect, prioritySelect, onChange };
    states.set(kind, state);

    const refresh = () => onChange();
    ownInput.addEventListener("change", refresh);
    sortSelect.addEventListener("change", refresh);
    prioritySelect?.addEventListener("change", refresh);

    if (!initialization) {
      initialization = loadMetadata();
    }

    return initialization.then(() => {
      groupContainer.replaceChildren();
      if (groups.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "参加中のグループがありません。";
        groupContainer.appendChild(empty);
        return;
      }

      groups.forEach((group) => {
        const label = document.createElement("label");
        label.className = "event-list-group-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(group.id);
        checkbox.checked = true;
        checkbox.addEventListener("change", refresh);
        const name = document.createElement("span");
        name.textContent = group.name || "名称未設定グループ";
        label.append(checkbox, name);
        groupContainer.appendChild(label);
      });
    });
  }

  async function getEvents(kind) {
    const state = states.get(kind);
    if (!state) throw new Error("一覧フィルターが初期化されていません。");
    await initialization;

    const selectedIds = Array.from(
      state.groupContainer.querySelectorAll('input[type="checkbox"]:checked')
    ).map((input) => input.value);
    if (selectedIds.length === 0) return [];

    const selectedGroups = groups.filter((group) =>
      selectedIds.includes(String(group.id))
    );
    let events = await fetchEventsForGroups(selectedGroups, kind);

    if (state.ownInput.checked) {
      events = events.filter((event) => String(event.created_by) === String(currentUserId));
    }

    const dateField = kind === "task" ? "end_time" : "start_time";
    const priority = (event) => {
      if (event.priority === "高" || /優先度\s*[:：]\s*高/.test(event.description || "")) {
        return "high";
      }
      if (event.priority === "中" || /優先度\s*[:：]\s*中/.test(event.description || "")) {
        return "medium";
      }
      if (event.priority === "低" || /優先度\s*[:：]\s*低/.test(event.description || "")) {
        return "low";
      }
      return "unset";
    };

    if (kind === "task" && state.prioritySelect.value !== "all") {
      events = events.filter((event) => priority(event) === state.prioritySelect.value);
    }

    const sortDirection = state.sortSelect.value === "date-desc" ? -1 : 1;
    events.sort((left, right) =>
      sortDirection *
      (new Date(left[dateField]).getTime() - new Date(right[dateField]).getTime())
    );
    return events;
  }

  async function getAllEvents(kind) {
    if (!states.has(kind)) throw new Error("一覧フィルターが初期化されていません。");
    await initialization;
    return fetchEventsForGroups(groups, kind);
  }

  async function fetchEventsForGroups(selectedGroups, kind) {
    const results = await Promise.all(selectedGroups.map(async (group) => {
      const response = await fetch(
        `${apiBaseUrl()}/api/events?groupId=${encodeURIComponent(group.id)}`,
        { credentials: "include" }
      );
      if (response.status === 401) {
        window.location.href = "login.html";
        throw new Error("ログインの有効期限が切れています。再ログインしてください。");
      }
      if (!response.ok) {
        throw new Error(`「${group.name}」の予定・課題を取得できませんでした。`);
      }
      const data = await response.json();
      if (!Array.isArray(data.events)) {
        throw new Error(`「${group.name}」の予定・課題データの形式が正しくありません。`);
      }
      return data.events.map((event) => ({
        ...event,
        group_name: group.name || "名称未設定グループ",
      }));
    }));

    return results.flat().filter((event) =>
      (event.description || "").startsWith(kind === "task" ? "[課題]" : "[予定]")
    );
  }

  function selectedGroupCount(kind) {
    const state = states.get(kind);
    if (!state) return 0;
    return state.groupContainer.querySelectorAll('input[type="checkbox"]:checked').length;
  }

  return { initialize, getEvents, getAllEvents, selectedGroupCount };
})();
