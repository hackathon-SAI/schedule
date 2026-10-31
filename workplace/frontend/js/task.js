// 課題一覧の取得と表示
async function loadTasks() {
  try {
    await window.EventActions.ready;
    const groupId = localStorage.getItem('selectedGroupId');

    if (!groupId) {
      renderTaskList([]);
      return;
    }

    const res = await fetch(
      `${API_BASE_URL}/api/events?groupId=${encodeURIComponent(groupId)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (res.status === 401) {
      window.location.href = 'login.html';
      return;
    }

    if (!res.ok) {
      console.error('課題の取得に失敗しました:', res.status);
      return;
    }

    const data = await res.json();

    const tasks = (data.events || []).filter(event =>
      (event.description || '').startsWith('[課題]')
    );

    renderTaskList(tasks);
  } catch (err) {
    console.error('課題取得エラー:', err);
  }
}

// 課題カードの表示
function renderTaskList(tasks) {
  const container = document.getElementById('taskList');
  if (!container) return;

  container.replaceChildren();

  if (tasks.length === 0) {
    const message = document.createElement('p');
    message.textContent = '課題はありません。';
    container.appendChild(message);
    return;
  }

  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'task-card';

    const title = document.createElement('h3');
    title.textContent = task.title;

    const deadline = document.createElement('p');
    deadline.textContent = `📅 期限: ${task.end_time
      ? new Date(task.end_time).toLocaleDateString('ja-JP')
      : '未設定'
      }`;

    card.appendChild(title);
    card.appendChild(deadline);
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

  loadTasks();

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
