window.EventCreation = (() => {
  const groupSelectors = [
    document.getElementById("taskGroupId"),
    document.getElementById("scheduleGroupId"),
    document.getElementById("googleImportGroup"),
  ].filter(Boolean);

  let groups = [];
  let loadError;

  function populateSelectors() {
    const activeGroupId = localStorage.getItem("selectedGroupId");
    const defaultGroup = groups.find((group) => String(group.id) === activeGroupId) || groups[0];

    groupSelectors.forEach((select) => {
      select.replaceChildren();
      if (groups.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "参加中のグループがありません";
        select.appendChild(option);
        select.disabled = true;
        return;
      }

      groups.forEach((group) => {
        const option = document.createElement("option");
        option.value = String(group.id);
        option.textContent = group.name;
        select.appendChild(option);
      });
      select.value = String(defaultGroup.id);
      select.disabled = false;
    });
  }

  async function loadGroups() {
    const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
    const response = await fetch(`${baseUrl}/api/groups`, {
      credentials: "include",
    });

    if (response.status === 401) {
      window.location.href = "login.html";
      throw new Error("ログインの有効期限が切れています。再ログインしてください。");
    }
    if (!response.ok) {
      throw new Error("グループ一覧を取得できませんでした。");
    }

    const data = await response.json();
    if (!Array.isArray(data.groups)) {
      throw new Error("グループ一覧の形式が正しくありません。");
    }

    groups = data.groups;
    populateSelectors();
  }

  const ready = loadGroups().catch((error) => {
    loadError = error;
    console.error("保存先グループの読み込みに失敗しました:", error);
    groupSelectors.forEach((select) => {
      select.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "グループ一覧を読み込めません";
      select.appendChild(option);
      select.disabled = true;
    });
  });

  function selectedGroupId(selectId) {
    if (loadError) throw loadError;
    return document.getElementById(selectId)?.value || "";
  }

  function activateGroup(groupId) {
    const group = groups.find((item) => String(item.id) === String(groupId));
    if (!group) return;

    localStorage.setItem("selectedGroupId", String(group.id));
    localStorage.setItem("selectedGroupName", group.name || "グループ");

    if (typeof updateDashboard === "function") updateDashboard();
    if (typeof loadTasks === "function") loadTasks();
    if (typeof updateCalendar === "function") updateCalendar();
  }

  return { ready, selectedGroupId, activateGroup, groups: () => groups };
})();
