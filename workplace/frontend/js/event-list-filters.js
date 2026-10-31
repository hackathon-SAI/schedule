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

  function createSortSelect(kind) {
    const select = document.createElement("select");
    select.className = "event-list-sort";
    select.setAttribute("aria-label", "並び順");
    const choices = kind === "task"
      ? [
          ["deadline", "期限が近い順"],
          ["priority", "優先順位：高を先に"],
        ]
      : [["start", "開始日時が近い順"]];

    choices.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    return select;
  }

  function initialize(kind, controlsId, onChange) {
    const root = document.getElementById(controlsId);
    if (!root) return Promise.resolve();

    const groupContainer = root.querySelector(".event-list-groups");
    const ownInput = root.querySelector(".event-list-own");
    const sortSelect = createSortSelect(kind);
    const sortLabel = document.createElement("label");
    sortLabel.className = "event-list-sort-label";
    sortLabel.append("並び順 ", sortSelect);
    root.appendChild(sortLabel);

    const state = { groupContainer, ownInput, sortSelect, onChange };
    states.set(kind, state);

    const refresh = () => onChange();
    ownInput.addEventListener("change", refresh);
    sortSelect.addEventListener("change", refresh);

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

    let events = results.flat().filter((event) =>
      (event.description || "").startsWith(kind === "task" ? "[課題]" : "[予定]")
    );
    if (state.ownInput.checked) {
      events = events.filter((event) => String(event.created_by) === String(currentUserId));
    }

    const dateField = kind === "task" ? "end_time" : "start_time";
    const priority = (event) => {
      if (event.priority === "高") return 3;
      if (/優先度\s*[:：]\s*高/.test(event.description || "")) return 3;
      if (/優先度\s*[:：]\s*中/.test(event.description || "")) return 2;
      if (/優先度\s*[:：]\s*低/.test(event.description || "")) return 1;
      return 0;
    };

    events.sort((left, right) => {
      if (kind === "task" && state.sortSelect.value === "priority") {
        const priorityDifference = priority(right) - priority(left);
        if (priorityDifference) return priorityDifference;
      }
      return new Date(left[dateField]).getTime() - new Date(right[dateField]).getTime();
    });
    return events;
  }

  function selectedGroupCount(kind) {
    const state = states.get(kind);
    if (!state) return 0;
    return state.groupContainer.querySelectorAll('input[type="checkbox"]:checked').length;
  }

  return { initialize, getEvents, selectedGroupCount };
})();
