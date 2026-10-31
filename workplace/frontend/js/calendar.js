
let calendar;

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
    initialView: "dayGridMonth",
    height: "100%",
    selectable: true,
    navLinks: true,
    nowIndicator: true,
    editable: false,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek"
    },
    buttonText: {
      today: "今日",
      month: "月",
      week: "週"
    },
    dateClick: function (info) {
      showSchedule(info.dateStr);
    },
    eventClick: function (info) {
      window.EventActions.ready.then(() => {
        window.EventActions.open(info.event.extendedProps);
      });
    },
    expandRows: true,
    dayMaxEventRows: true,
  });

  calendar.render();
  updateCalendar();
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
      credentials: "include"
    }
  );

  if (res.status === 401) {
    window.location.href = "login.html";
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

  try {
    const events = await getGroupEvents();

    calendar.removeAllEvents();

    events.forEach(event => {
      let color = "#4285F4";
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

      calendar.addEvent({
        id: String(event.id),
        title: event.title,
        start: event.start_time,
        end: event.end_time,
        backgroundColor: color,
        borderColor: color,
        extendedProps: event
      });
    });
  } catch (err) {
    console.error("カレンダー更新エラー:", err);
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
