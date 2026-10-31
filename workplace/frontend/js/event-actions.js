window.EventActions = (() => {
  let currentUserId = null;
  let groupRoles = new Map();
  let editingEvent = null;
  let editingGroupRole = null;

  const dialog = document.createElement("dialog");
  dialog.className = "event-edit-dialog";
  dialog.setAttribute("aria-labelledby", "eventEditTitle");

  const form = document.createElement("form");
  form.className = "event-edit-form";

  const header = document.createElement("div");
  header.className = "event-edit-header";
  const heading = document.createElement("h2");
  heading.id = "eventEditTitle";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "閉じる";
  closeButton.addEventListener("click", () => dialog.close());
  header.append(heading, closeButton);

  function createField(labelText, type, id) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.id = id;
    input.name = id;
    if (type !== "textarea") input.type = type;
    if (type === "text") input.maxLength = 100;
    input.required = type !== "textarea";
    label.appendChild(input);
    return { label, input };
  }

  const titleField = createField("タイトル", "text", "eventEditName");
  const dateField = createField("期限", "date", "eventEditDate");
  const startField = createField("開始日時", "datetime-local", "eventEditStart");
  const endField = createField("終了日時", "datetime-local", "eventEditEnd");
  const memoField = createField("メモ・内容", "textarea", "eventEditMemo");

  const message = document.createElement("p");
  message.className = "event-edit-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "event-edit-actions";
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "event-edit-delete";
  deleteButton.textContent = "削除";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", () => dialog.close());
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "event-edit-save";
  saveButton.textContent = "変更を保存";
  actions.append(deleteButton, cancelButton, saveButton);

  form.append(
    header,
    titleField.label,
    dateField.label,
    startField.label,
    endField.label,
    memoField.label,
    message,
    actions
  );
  dialog.appendChild(form);
  document.body.appendChild(dialog);

  const titleInput = titleField.input;
  const dateInput = dateField.input;
  const startInput = startField.input;
  const endInput = endField.input;
  const memoInput = memoField.input;

  function isTask(event) {
    return String(event.description || "").startsWith("[課題]");
  }

  function canManage(event, groupRole) {
    return groupRole === "admin" || (
      currentUserId !== null &&
      String(event.created_by) === String(currentUserId)
    );
  }

  function dateInTokyo(value) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  }

  function dateTimeInTokyo(value) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
    return parts.replace(" ", "T");
  }

  function makeActionButton(text, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", action);
    return button;
  }

  function addControls(container, event, groupRole) {
    ready.then(() => {
      if (!container.isConnected || !canManage(event, groupRole)) return;

      const controls = document.createElement("div");
      controls.className = "event-action-buttons";
      controls.append(
        makeActionButton("編集", "event-edit-button", () => open(event, groupRole)),
        makeActionButton("削除", "event-delete-button", () => remove(event, groupRole))
      );
      container.appendChild(controls);
    });
  }

  function open(event, groupRole) {
    if (!canManage(event, groupRole)) {
      window.alert("この予定・課題を編集する権限がありません。");
      return;
    }

    editingEvent = event;
    editingGroupRole = groupRole || null;
    const task = isTask(event);
    heading.textContent = task ? "課題を編集" : "予定を編集";
    titleInput.value = event.title || "";
    dateInput.value = task ? dateInTokyo(event.end_time) : "";
    startInput.value = task ? "" : dateTimeInTokyo(event.start_time);
    endInput.value = task ? "" : dateTimeInTokyo(event.end_time);
    dateInput.required = task;
    startInput.required = !task;
    endInput.required = !task;
    memoInput.value = String(event.description || "").replace(/^\[(?:課題|予定)\]\s*/, "");
    dateField.label.hidden = !task;
    startField.label.hidden = task;
    endField.label.hidden = task;
    message.textContent = "";
    deleteButton.disabled = false;
    saveButton.disabled = false;
    dialog.showModal();
  }

  async function sendEventRequest(event, method, body) {
    const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
    const response = await fetch(
      `${baseUrl}/api/events/${encodeURIComponent(event.id)}`,
      {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }
    );
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "login.html";
      throw new Error("ログインの有効期限が切れています。再ログインしてください。");
    }
    if (!response.ok) {
      throw new Error(data.error || data.message || "操作に失敗しました。");
    }
    return data;
  }

  function notifyChanged(event) {
    window.dispatchEvent(new CustomEvent("event-changed", {
      detail: { groupId: event.group_id },
    }));
    if (typeof updateCalendar === "function") updateCalendar();
    if (typeof loadTasks === "function") loadTasks();
    if (typeof updateDashboard === "function") updateDashboard();
  }

  async function remove(event, groupRole) {
    if (!canManage(event, groupRole)) {
      window.alert("この予定・課題を削除する権限がありません。");
      return;
    }
    if (!window.confirm(`「${event.title}」を削除しますか？この操作は取り消せません。`)) return;

    try {
      await sendEventRequest(event, "DELETE");
      notifyChanged(event);
      if (dialog.open) dialog.close();
    } catch (error) {
      console.error("予定・課題の削除に失敗しました:", error);
      window.alert(error.message || "削除に失敗しました。");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingEvent) return;

    const task = isTask(editingEvent);
    if (!titleInput.value.trim()) {
      message.textContent = "タイトルを入力してください。";
      return;
    }

    const description = `[${task ? "課題" : "予定"}] ${memoInput.value.trim()}`;
    const body = {
      title: titleInput.value.trim(),
      description,
    };

    if (task) {
      body.end_time = new Date(dateInput.value).toISOString();
    } else {
      const start = new Date(`${startInput.value}:00+09:00`);
      const end = new Date(`${endInput.value}:00+09:00`);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        message.textContent = "終了時刻は開始時刻より後に設定してください。";
        return;
      }
      body.start_time = start.toISOString();
      body.end_time = end.toISOString();
    }

    saveButton.disabled = true;
    deleteButton.disabled = true;
    message.textContent = "保存しています...";
    try {
      await sendEventRequest(editingEvent, "PUT", body);
      notifyChanged(editingEvent);
      dialog.close();
    } catch (error) {
      console.error("予定・課題の更新に失敗しました:", error);
      message.textContent = error.message || "変更を保存できませんでした。";
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  });

  deleteButton.addEventListener("click", () => {
    if (editingEvent) remove(editingEvent, editingGroupRole);
  });

  const ready = (async () => {
    const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";
    const [userResponse, groupsResponse] = await Promise.all([
      fetch(`${baseUrl}/api/auth/me`, { credentials: "include" }),
      fetch(`${baseUrl}/api/groups`, { credentials: "include" }),
    ]);

    if (!userResponse.ok || !groupsResponse.ok) {
      throw new Error("編集権限を確認できませんでした。");
    }

    const [userData, groupsData] = await Promise.all([
      userResponse.json(),
      groupsResponse.json(),
    ]);
    currentUserId = userData.user?.id ?? null;
    groupRoles = new Map(
      (Array.isArray(groupsData.groups) ? groupsData.groups : [])
        .map((group) => [String(group.id), group.role])
    );
  })().catch((error) => {
    console.error("予定・課題の編集権限確認に失敗しました:", error);
  });

  return {
    ready,
    canManage,
    open,
    remove,
    addControls,
  };
})();
