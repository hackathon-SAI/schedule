document.addEventListener("DOMContentLoaded", () => {
  const classroomButton = document.getElementById("loadClassroomButton");
  const calendarButton = document.getElementById("loadGoogleCalendarButton");
  const classroomItems = document.getElementById("classroomItems");
  const calendarItems = document.getElementById("googleCalendarItems");
  const classroomMessage = document.getElementById("classroomMessage");
  const calendarMessage = document.getElementById("googleCalendarMessage");
  const reauthorizeButton = document.getElementById("reauthorizeGoogleButton");
  const baseUrl = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";

  async function request(path) {
    const response = await fetch(`${baseUrl}${path}`, {
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "login.html";
      throw new Error("ログインの有効期限が切れています。");
    }
    if (!response.ok) {
      throw new Error(data.error || "Googleからデータを取得できませんでした。");
    }
    return data;
  }

  function setMessage(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  function createLink(url, label) {
    if (!url) return null;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null;

    const link = document.createElement("a");
    link.href = parsed.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    return link;
  }

  function formatClassroomDeadline(item) {
    if (!item.dueDate) return null;
    const { year, month, day } = item.dueDate;
    const hours = String(item.dueTime?.hours ?? 23).padStart(2, "0");
    const minutes = String(item.dueTime?.minutes ?? 59).padStart(2, "0");
    return new Date(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${hours}:${minutes}:00+09:00`
    );
  }

  function formatCreatedAt(value) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  }

  function googleCalendarTimes(item) {
    if (!item.start || !item.end) return null;
    let start;
    let end;

    if (item.start.dateTime) {
      start = new Date(item.start.dateTime);
    } else if (item.start.date) {
      start = new Date(`${item.start.date}T00:00:00+09:00`);
    }

    if (item.end.dateTime) {
      end = new Date(item.end.dateTime);
    } else if (item.end.date) {
      end = new Date(`${item.end.date}T00:00:00+09:00`);
      end.setMinutes(end.getMinutes() - 1);
    }

    if (!start || !end || !Number.isFinite(start.getTime()) || end <= start) {
      return null;
    }
    return { start, end };
  }

  async function importEvent(button, groupId, event, kind) {
    if (!groupId) {
      throw new Error("追加先グループを選択してください。");
    }

    const shouldCreate = await confirmNoSimilarEvent({
      groupId,
      kind,
      title: event.title,
      description: event.description,
      startTime: event.start.toISOString(),
      endTime: event.end.toISOString(),
    });
    if (!shouldCreate) return false;

    button.disabled = true;
    try {
      const response = await fetch(`${baseUrl}/api/events`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: Number(groupId),
          title: event.title,
          description: event.description,
          start_time: event.start.toISOString(),
          end_time: event.end.toISOString(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.href = "login.html";
        throw new Error("ログインの有効期限が切れています。");
      }
      if (!response.ok) {
        throw new Error(data.error || data.message || "グループへの追加に失敗しました。");
      }

      window.EventCreation.activateGroup(groupId);
      setMessage(
        kind === "task" ? classroomMessage : calendarMessage,
        `「${event.title}」をグループに追加しました。`
      );
      return true;
    } finally {
      button.disabled = false;
    }
  }

  function renderItems(container, items, kind) {
    container.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = kind === "task"
        ? "取得できる課題はありません。"
        : "取得できる予定はありません。";
      container.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "google-import-card";
      const title = document.createElement("h4");
      title.textContent = item.title;
      card.appendChild(title);

      const detail = document.createElement("p");
      detail.textContent = item.detail;
      card.appendChild(detail);

      if (item.description) {
        const description = document.createElement("p");
        description.textContent = item.description;
        card.appendChild(description);
      }
      const link = createLink(item.url, "Googleで開く");
      if (link) card.appendChild(link);

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.textContent = item.canImport ? "選択したグループに追加" : "期限がないため追加できません";
      addButton.disabled = !item.canImport;
      addButton.addEventListener("click", async () => {
        try {
          const groupId = window.EventCreation.selectedGroupId("googleImportGroup");
          const added = await importEvent(addButton, groupId, item.event, kind);
          if (added) addButton.textContent = "追加しました";
        } catch (error) {
          console.error("Googleデータの追加に失敗しました:", error);
          setMessage(
            kind === "task" ? classroomMessage : calendarMessage,
            error.message || "グループへの追加に失敗しました。",
            true
          );
        }
      });
      card.appendChild(addButton);
      container.appendChild(card);
    });
  }

  async function loadClassroom() {
    classroomButton.disabled = true;
    setMessage(classroomMessage, "Classroomの課題を取得しています...");
    try {
      await window.EventCreation.ready;
      const data = await request("/api/auth/google/classroom/coursework");
      const items = (data.coursework || []).map((item) => {
        const deadline = formatClassroomDeadline(item);
        const createdAt = formatCreatedAt(item.creationTime);
        const dueDateText = deadline
          ? `期限: ${deadline.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`
          : "期限なし";
        const notes = [
          item.description,
          item.alternateLink ? `Classroom: ${item.alternateLink}` : "",
        ].filter(Boolean).join("\n");
        const end = deadline || null;
        const start = end ? new Date(end.getTime() - 60 * 1000) : null;
        return {
          title: item.title || "タイトルなし",
          detail: `${item.courseName} ・ ${createdAt ? `追加日: ${createdAt} ・ ` : ""}${dueDateText}`,
          description: item.description || "",
          url: item.alternateLink,
          canImport: Boolean(end),
          event: end
            ? {
                title: item.title || "タイトルなし",
                description: `[課題] Classroom「${item.courseName}」${notes ? `\n${notes}` : ""}`,
                start,
                end,
              }
            : null,
        };
      });
      renderItems(classroomItems, items, "task");
      setMessage(classroomMessage, `${data.academicYear || "今年度"}の課題を${items.length}件取得しました。`);
    } catch (error) {
      console.error("Classroom課題の取得に失敗しました:", error);
      setMessage(classroomMessage, error.message || "Classroom課題を取得できませんでした。", true);
    } finally {
      classroomButton.disabled = false;
    }
  }

  async function loadCalendar() {
    calendarButton.disabled = true;
    setMessage(calendarMessage, "Googleカレンダーの予定を取得しています...");
    try {
      await window.EventCreation.ready;
      const data = await request("/api/auth/google/calendar/events");
      const items = (data.events || []).map((item) => {
        const times = googleCalendarTimes(item);
        const eventTitle = item.summary || "タイトルなし";
        const createdAt = formatCreatedAt(item.created);
        const notes = [
          item.description,
          item.htmlLink ? `Google Calendar: ${item.htmlLink}` : "",
        ].filter(Boolean).join("\n");
        return {
          title: eventTitle,
          detail: times
            ? `${times.start.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} ～ ${times.end.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}${createdAt ? ` ・ 追加日: ${createdAt}` : ""}`
            : "日時を読み取れません",
          description: item.description || "",
          url: item.htmlLink,
          canImport: Boolean(times),
          event: times
            ? {
                title: eventTitle,
                description: `[予定] ${notes}`,
                start: times.start,
                end: times.end,
              }
            : null,
        };
      });
      renderItems(calendarItems, items, "schedule");
      setMessage(calendarMessage, `${data.academicYear || "今年度"}の予定を${items.length}件取得しました。`);
    } catch (error) {
      console.error("Googleカレンダー予定の取得に失敗しました:", error);
      setMessage(calendarMessage, error.message || "Googleカレンダーの予定を取得できませんでした。", true);
    } finally {
      calendarButton.disabled = false;
    }
  }

  classroomButton.addEventListener("click", loadClassroom);
  calendarButton.addEventListener("click", loadCalendar);

  reauthorizeButton.addEventListener("click", async () => {
    if (!window.confirm("Google連携を更新するため、いったんログアウトしてGoogleの権限確認をやり直します。続けますか？")) {
      return;
    }
    reauthorizeButton.disabled = true;
    try {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("ログアウトできませんでした。");
      window.location.href = "login.html?reauthorize_google=true";
    } catch (error) {
      console.error("Google連携の再認証を開始できませんでした:", error);
      window.alert(error.message || "Google連携の再認証を開始できませんでした。");
      reauthorizeButton.disabled = false;
    }
  });
});
