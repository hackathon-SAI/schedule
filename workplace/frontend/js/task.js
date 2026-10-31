// 課題一覧の取得と表示
async function loadTasks() {
  try {
    await window.EventActions.ready;
    const tasks = await window.EventListFilters.getEvents('task');
    renderTaskList(
      tasks,
      window.EventListFilters.selectedGroupCount('task') === 0
        ? '表示するグループを選択してください。'
        : '課題はありません。'
    );
  } catch (err) {
    console.error('課題取得エラー:', err);
    renderTaskList([], '課題一覧を読み込めませんでした。');
  }
}

// 課題カードの表示
function renderTaskList(tasks, emptyMessage = '課題はありません。') {
  const container = document.getElementById('taskList');
  if (!container) return;

  container.replaceChildren();

  if (tasks.length === 0) {
    const message = document.createElement('p');
    message.textContent = emptyMessage;
    container.appendChild(message);
    return;
  }

  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'task-card';

    const title = document.createElement('h3');
    title.textContent = task.title || 'タイトルなし';

    const group = document.createElement('p');
    group.className = 'event-list-group-name';
    group.textContent = `👥 ${task.group_name || 'グループ不明'}`;
    const start = document.createElement('p');
    start.textContent = `🕐 開始: ${task.start_time
      ? new Date(task.start_time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
      : '未設定'
      }`;
    const deadline = document.createElement('p');
    deadline.textContent = `📅 期限: ${task.end_time
      ? new Date(task.end_time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
      : '未設定'
      }`;

    card.appendChild(title);
    card.appendChild(group);
    card.appendChild(start);
    card.appendChild(deadline);
    const details = String(task.description || '').replace(/^\[課題\]\s*/, '').trim();
    if (details) {
      const description = document.createElement('p');
      description.textContent = `📝 ${details}`;
      card.appendChild(description);
    }
    window.EventActions.addControls(card, task);
    container.appendChild(card);
  });
}

// 課題の追加
async function addTask(title, deadline, description) {
  try {
    await EventCreation.ready;
    const groupId = EventCreation.selectedGroupId('taskGroupId');

    if (!groupId) {
      alert('課題の保存先グループを選択してください。');
      return false;
    }

    const startTime = new Date();
    const endTime = new Date(deadline);

    if (Number.isNaN(endTime.getTime())) {
      alert('提出期限を正しく入力してください。');
      return false;
    }

    if (endTime <= startTime) {
      alert('提出期限は現在より後の日時にしてください。');
      return false;
    }

    const descriptionText = `[課題] ${description || ''}`;
    let shouldCreate;
    try {
      shouldCreate = await confirmNoSimilarEvent({
        groupId,
        kind: 'task',
        title,
        description: descriptionText,
        endTime: endTime.toISOString(),
      });
    } catch (err) {
      console.error('課題の重複候補確認に失敗しました:', err);
      alert(err.message || '重複候補を確認できませんでした。');
      return false;
    }
    if (!shouldCreate) return false;

    const res = await fetch(`${API_BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        group_id: Number(groupId),
        title,
        description: descriptionText,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      }),
    });

    if (res.status === 401) {
      window.location.href = 'login.html';
      return false;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || data.error || '課題の追加に失敗しました。');
      return false;
    }

    EventCreation.activateGroup(groupId);

    return true;
  } catch (err) {
    console.error('課題の追加に失敗しました:', err);
    alert(err.message || '通信に失敗しました。');
    return false;
  }
}

// 画面の初期設定
document.addEventListener('DOMContentLoaded', () => {
  const addTaskButton = document.getElementById('addTaskButton');
  const taskModal = document.getElementById('taskModal');
  const closeModal = document.getElementById('closeModal');
  const saveTaskButton = document.getElementById('saveTask');

  window.EventListFilters.initialize('task', 'taskListFilters', loadTasks)
    .then(loadTasks)
    .catch((error) => {
      console.error('課題一覧フィルターの初期化に失敗しました:', error);
      renderTaskList([], 'グループ一覧を読み込めませんでした。');
    });

  if (addTaskButton && taskModal) {
    addTaskButton.addEventListener('click', () => {
      taskModal.classList.add('active');
      taskModal.style.display = 'block';
    });
  }

  if (closeModal && taskModal) {
    closeModal.addEventListener('click', () => {
      taskModal.classList.remove('active');
      taskModal.style.display = 'none';
    });
  }

  if (saveTaskButton) {
    saveTaskButton.addEventListener('click', async () => {
      const titleInput = document.getElementById('taskTitle');
      const deadlineInput = document.getElementById('deadline');
      const priorityInput = document.getElementById('priority');

      const title = titleInput?.value.trim();
      const deadline = deadlineInput?.value;
      const priority = priorityInput?.value;

      if (!title || !deadline) {
        alert('課題名と提出期限を入力してください。');
        return;
      }

      const success = await addTask(
        title,
        deadline,
        `優先度:${priority || '未設定'}`
      );

      if (success) {
        if (titleInput) titleInput.value = '';
        if (deadlineInput) deadlineInput.value = '';

        if (taskModal) {
          taskModal.classList.remove('active');
          taskModal.style.display = 'none';
        }
      }
    });
  }
});
