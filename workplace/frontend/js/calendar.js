let calendar;
let calendarUpdateRequest = 0;

// APIベースURL（グローバル変数が未定義の場合はデフォルトを使用）
const API_BASE_URL = window.API_BASE_URL || "https://schedule-backend-navy.vercel.app";

// JWT トークンを含む認証ヘッダーを構築（Cookie が機能しない場合のフォールバック）
function buildAuthHeaders(extraHeaders = {}) {
  // 'token' キーを優先し、後方互換性のため 'jwt_token' も確認
  const token = localStorage.getItem("token") || localStorage.getItem("jwt_token");
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

document.addEventListener("DOMContentLoaded", () => {
  initializeCalendar();

  // グループを切り替えたときにカレンダーを更新
  window.addEventListener("storage", (event) => {
    if (event.key === "selectedGroupId") {
      updateCalendar();
    }
  });
});

function initializeCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  calendar = new FullCalendar.Calendar(calendarEl, {
    locale: "ja",
    timeZone: "Asia/Tokyo",
    themeSystem: "monarch",
    initialView: "dayGridMonth",
    height: "auto",
    handleWindowResize: true,
    selectable: true,
    navLinks: true,
    nowIndicator: true,
    editable: true,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek"
    },
    buttonText: {
      today: "今日",
      month: "月",
      week: "週",
      list: "リスト",
      listWeek: "週一覧"
    },
    dayCellClassNames: (info) => weekendClassNames(info.date),
    dayHeaderClassNames: (info) => weekendClassNames(info.date),
    dateClick: function (info) {
      showSchedule(info.dateStr);
    },
    eventClick: function (info) {
      if (info.event.extendedProps.isHoliday) return;
      window.EventActions.ready.then(() => {
        window.EventActions.open(info.event.extendedProps);
      });
    },
    eventAllow: (_dropInfo, event) =>
      !event.extendedProps.isHoliday &&
      window.EventActions.canManage(
        event.extendedProps,
        window.EventActions.roleForEvent(event.extendedProps)
      ),
    eventDrop: saveEventDates,
    eventResize: saveEventDates,
    datesSet: updateCalendar,
    dayMaxEventRows: true,
  });

  window.calendar = calendar;
  calendar.render();
}

async function getGroupEvents() {
  const groupId = localStorage.getItem("selectedGroupId");

  if (!groupId) {
    return [];
  }

  const res = await fetch(
    `${API_BASE_URL}/api/events?groupId=${encodeURIComponent(groupId)}`,
    {
      method: "GET",
      headers: buildAuthHeaders(),
      credentials: "include"
    }
  );

  if (res.status === 401) {
    console.warn("認証期限が切れています。ログインしてください。");
    return [];
  }

  if (!res.ok) {
    throw new Error("イベント一覧の取得に失敗しました。");
  }

  const data = await res.json();

  // APIの返却形式 { events: [...] } に対応
  return Array.isArray(data.events) ? data.events : [];
}

async function updateCalendar() {
  if (!calendar) return;
  const requestId = ++calendarUpdateRequest;
  const status = document.getElementById("calendarStatus");

  const start = formatDateInTokyo(calendar.view.activeStart);
  const end = formatDateInTokyo(calendar.view.activeEnd);
  await window.EventActions.ready;
  const [eventsResult, holidaysResult] = await Promise.allSettled([
    getGroupEvents(),
    getJapaneseHolidays(start, end)
  ]);
  if (requestId !== calendarUpdateRequest) return;

  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const holidays = holidaysResult.status === "fulfilled" ? holidaysResult.value : [];
  const messages = [];
  if (eventsResult.status === "rejected") {
    console.error("カレンダーの予定取得に失敗しました:", eventsResult.reason);
    messages.push("予定・課題を取得できませんでした。");
  }
  if (holidaysResult.status === "rejected") {
    console.error("祝日情報の取得に失敗しました:", holidaysResult.reason);
    messages.push("祝日情報を取得できませんでした。");
  }
  if (status) status.textContent = messages.join(" ");

  calendar.removeAllEvents();

  events.forEach(event => {
    // 1. バックエンドから返却された display_color（COALESCE(subject_color, group_color)）を優先適用
    // 2. なければ従来のフォールバックロジック（優先度別カラー / デフォルト青色）を適用
    let color = event.display_color || event.group_color || event.subject_color;

    if (!color) {
      color = "#4285F4";
      const description = event.description || "";

      if (description.startsWith("[課題]")) {
        if (description.includes("優先度:高")) {
          color = "#E53935";
        } else if (description.includes("優先度:中")) {
          color = "#FB8C00";
        } else if (description.includes("優先度:低")) {
          color = "#43A047";
        } else {
          color = "#E53935";
        }
      } else if (description.startsWith("[予定]")) {
        color = "#4285F4";
      }
    }

    calendar.addEvent({
      id: String(event.id),
      title: event.title,
      start: event.start_time,
      end: event.end_time,
      backgroundColor: color,
      borderColor: color,
      editable: window.EventActions.canManage(
        event,
        window.EventActions.roleForEvent(event)
      ),
      extendedProps: event
    });
  });

  holidays.forEach((holiday) => {
    const endDate = nextDate(holiday.date);
    const extendedProps = { isHoliday: true, holidayName: holiday.name };
    calendar.addEvent({
      id: `holiday-background-${holiday.date}`,
      start: holiday.date,
      end: endDate,
      display: "background",
      backgroundColor: "rgba(211, 47, 47, 0.16)",
      editable: false,
      extendedProps
    });
  });
}

async function getJapaneseHolidays(start, end) {
  const response = await fetch(
    `${API_BASE_URL}/api/calendar/holidays?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    { headers: buildAuthHeaders(), credentials: "include" }
  );
  if (response.status === 401) {
    console.warn("認証期限が切れています。ログインしてください。");
    throw new Error("ログインの有効期限が切れています。");
  }
  if (!response.ok) {
    throw new Error("祝日情報の取得に失敗しました。");
  }
  const data = await response.json();
  if (!Array.isArray(data.holidays)) {
    throw new Error("祝日情報の形式が正しくありません。");
  }
  return data.holidays;
}

function formatDateInTokyo(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function nextDate(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function weekendClassNames(date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).format(date);
  return weekday === "Sun" ? ["is-sun"] : weekday === "Sat" ? ["is-sat"] : [];
}

async function saveEventDates(info) {
  const event = info.event;
  if (!event.id || !event.start || !event.end) {
    info.revert();
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/events/${encodeURIComponent(event.id)}`,
      {
        method: "PUT",
        headers: buildAuthHeaders(),
      credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_time: event.start.toISOString(),
          end_time: event.end.toISOString()
        })
      }
    );
    if (response.status === 401) {
      console.warn("認証期限が切れています。ログインしてください。");
      throw new Error("ログインの有効期限が切れています。");
    }
    if (!response.ok) {
      throw new Error("予定・課題の変更を保存できませんでした。");
    }
    event.setExtendedProp("start_time", event.start.toISOString());
    event.setExtendedProp("end_time", event.end.toISOString());
  } catch (error) {
    console.error("カレンダー上の日時変更に失敗しました:", error);
    info.revert();
    const status = document.getElementById("calendarStatus");
    if (status) status.textContent = error.message || "変更を保存できませんでした。";
  }
}

async function showSchedule(dateStr) {
  const scheduleList = document.getElementById("scheduleList");
  if (!scheduleList) return;

  try {
    await window.EventActions.ready;
    const allEvents = await getGroupEvents();

    // 日本時間で指定日のイベントを抽出
    const dayEvents = allEvents.filter(event => {
      if (!event.start_time) return false;

      const eventDate = new Date(event.start_time)
        .toLocaleDateString("sv-SE", {
          timeZone: "Asia/Tokyo"
        });

      return eventDate === dateStr;
    });

    scheduleList.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = dateStr;
    scheduleList.appendChild(title);

    if (dayEvents.length === 0) {
      const p = document.createElement("p");
      p.textContent = "この日の予定・課題はありません。";
      scheduleList.appendChild(p);
      return;
    }

    dayEvents.forEach(event => {
      const div = document.createElement("div");
      div.className = "task-card";

      const heading = document.createElement("h3");
      heading.textContent = event.title || "";

      const description = document.createElement("p");
      description.textContent = event.description
        ? `📝 ${event.description}`
        : "";

      const time = document.createElement("p");
      if (event.start_time && event.end_time) {
        const start = new Date(event.start_time).toLocaleTimeString(
          "ja-JP",
          { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }
        );
        const end = new Date(event.end_time).toLocaleTimeString(
          "ja-JP",
          { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }
        );
        time.textContent = `🕐 ${start} ～ ${end}`;
      }

      div.appendChild(heading);
      if (description.textContent) div.appendChild(description);
      if (time.textContent) div.appendChild(time);
      if ((event.description || "").startsWith("[課題]")) {
        window.EventActions.appendAuditMetadata(div, event);
      }
      window.EventActions.addControls(div, event);

      scheduleList.appendChild(div);
    });
  } catch (err) {
    console.error("詳細表示エラー:", err);
  }
}

function refreshCalendar() {
  updateCalendar();
}