
const API_BASE_URL = window.API_BASE_URL;

document.addEventListener('DOMContentLoaded', () => {
  const groupNameInput = document.getElementById('groupName');
  const inviteCodeInput = document.getElementById('inviteCode');
  const createButton = document.getElementById('createGroupButton');
  const joinButton = document.getElementById('joinGroupButton');
  const shareMessage = document.getElementById('shareMessage');
  const groupInfo = document.getElementById('groupInfo');
  const groupDetails = document.getElementById('groupDetails');
  const groupTitle = document.getElementById('groupTitle');
  const groupRole = document.getElementById('groupRole');
  const groupInviteCode = document.getElementById('groupInviteCode');
  const groupMembers = document.getElementById('groupMembers');
  const groupEvents = document.getElementById('groupEvents');
  const copyInviteCodeButton = document.getElementById('copyGroupInviteCode');
  let groupDetailsRequestId = 0;

  document.getElementById('shareMenuButton')?.addEventListener('click', () => {
    loadGroups();
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel) {
      menuPanel.classList.remove('active');
    }
    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'メニューを開く');
    }
  });

  async function apiRequest(path, options = {}) {
    let response;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    }, 15000);

    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (error) {
      console.error(`グループAPI通信エラー (${path}):`, error);
      throw new Error(
        error.name === 'AbortError' || error.name === 'TimeoutError'
          ? '通信がタイムアウトしました。時間をおいてもう一度お試しください。'
          : 'サーバーに接続できませんでした。通信環境を確認してもう一度お試しください。'
      );
    } finally {
      window.clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('ログインの有効期限が切れています。再ログインしてください。');
      }

      throw new Error(data.error || data.message || '通信に失敗しました。');
    }

    return data;
  }

  async function loadGroups() {
    try {
      const data = await apiRequest('/api/groups');
      const groups = data.groups || [];

      if (!groupInfo) return;

      const list = document.createElement('div');
      list.id = 'groupList';

      const heading = document.createElement('h3');
      heading.textContent = '参加中のグループ';
      list.appendChild(heading);

      if (groups.length === 0) {
        const message = document.createElement('p');
        message.textContent = '参加中のグループはありません。';
        list.appendChild(message);
      }

      groups.forEach((group) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = group.name;

        button.addEventListener('click', () => {
          showGroup(group);
          loadGroupDetails(group.id);
        });

        list.appendChild(button);
      });

      const oldList = groupInfo.querySelector('#groupList');
      if (oldList) oldList.remove();

      groupInfo.prepend(list);

      const selectedGroupId = localStorage.getItem('selectedGroupId');
      const selectedGroup = groups.find(
        (group) => String(group.id) === selectedGroupId
      );
      if (selectedGroup) {
        await loadGroupDetails(selectedGroup.id);
      } else if (selectedGroupId) {
        localStorage.removeItem('selectedGroupId');
        localStorage.removeItem('selectedGroupName');
        groupDetails.hidden = true;
        refreshGroupData();
      }
    } catch (error) {
      console.error('グループ一覧の取得エラー:', error);
      if (shareMessage) shareMessage.textContent = error.message;
    }
  }

  function refreshGroupData() {
    if (typeof window.loadTasks === 'function') window.loadTasks();
    if (typeof window.updateCalendar === 'function') window.updateCalendar();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
  }

  function showGroup(group) {
    if (!group || group.id == null) {
      throw new Error('グループ情報を取得できませんでした。');
    }

    const name = group.name || 'グループ';
    const code = group.invite_code || group.inviteCode || '';

    localStorage.setItem('selectedGroupId', String(group.id));
    localStorage.setItem('selectedGroupName', name);

    if (groupTitle) groupTitle.textContent = name;
    if (groupInviteCode) groupInviteCode.textContent = `招待コード：${code || '取得できませんでした'}`;
    if (groupDetails) groupDetails.hidden = false;
    if (shareMessage) shareMessage.textContent = `${name} を選択しました。`;
    refreshGroupData();
  }

  async function loadGroupDetails(groupId) {
    const requestId = ++groupDetailsRequestId;
    try {
      const [detailData, eventData] = await Promise.all([
        apiRequest(`/api/groups/${encodeURIComponent(groupId)}`),
        apiRequest(`/api/groups/${encodeURIComponent(groupId)}/events`),
      ]);

      if (
        requestId !== groupDetailsRequestId ||
        localStorage.getItem('selectedGroupId') !== String(groupId)
      ) {
        return;
      }

      const group = detailData.group;
      if (!group || !Array.isArray(detailData.members)) {
        throw new Error('グループ概要の形式が正しくありません。');
      }

      showGroup(group);
      if (groupRole) {
        const role = group.role || 'member';
        groupRole.textContent = `あなたの権限：${role === 'admin' ? '管理者' : 'メンバー'}`;
      }
      if (groupInviteCode) {
        groupInviteCode.textContent = `招待コード：${group.invite_code || '取得できませんでした'}`;
      }
      if (groupMembers) {
        groupMembers.replaceChildren();
        detailData.members.forEach((member) => {
          const item = document.createElement('li');
          const role = member.role === 'admin' ? '管理者' : 'メンバー';
          item.textContent = `${member.name || member.email}（${role}）`;
          groupMembers.appendChild(item);
        });
      }

      renderGroupEvents(eventData.events);
    } catch (error) {
      console.error('グループ情報の取得に失敗しました:', error);
      if (
        requestId === groupDetailsRequestId &&
        localStorage.getItem('selectedGroupId') === String(groupId) &&
        shareMessage
      ) {
        shareMessage.textContent = error.message || 'グループ情報を読み込めませんでした。';
      }
    }
  }

  function renderGroupEvents(events) {
    if (!groupEvents) return;
    if (!Array.isArray(events)) {
      throw new Error('予定一覧の形式が正しくありません。');
    }

    groupEvents.replaceChildren();
    const tasks = events
      .filter((event) => (event.description || '').startsWith('[課題]'))
      .sort((a, b) => new Date(a.end_time) - new Date(b.end_time));
    const schedules = events
      .filter((event) => !(event.description || '').startsWith('[課題]'))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    [
      { title: '課題', events: tasks, isTask: true },
      { title: '予定', events: schedules, isTask: false },
    ].forEach(({ title, events: items, isTask }) => {
      const section = document.createElement('section');
      section.className = 'group-event-section';

      const heading = document.createElement('h4');
      heading.textContent = title;
      section.appendChild(heading);

      if (items.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.textContent = `${title}はありません。`;
        section.appendChild(emptyMessage);
      }

      items.forEach((event) => {
        const card = document.createElement('article');
        card.className = 'group-event-card';

        const eventTitle = document.createElement('h5');
        eventTitle.textContent = event.title || '名称未設定';
        card.appendChild(eventTitle);

        const dateValue = isTask ? event.end_time : event.start_time;
        if (dateValue) {
          const date = new Date(dateValue);
          const dateText = document.createElement('p');
          const formattedDate = date.toLocaleDateString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
          dateText.textContent = isTask ? `📅 提出期限：${formattedDate}` : `📅 ${formattedDate}`;

          if (!isTask && event.end_time) {
            const end = new Date(event.end_time);
            dateText.textContent += ` ${date.toLocaleTimeString('ja-JP', {
              timeZone: 'Asia/Tokyo',
              hour: '2-digit',
              minute: '2-digit',
            })} ～ ${end.toLocaleTimeString('ja-JP', {
              timeZone: 'Asia/Tokyo',
              hour: '2-digit',
              minute: '2-digit',
            })}`;
          }
          card.appendChild(dateText);
        }

        const description = (event.description || '')
          .replace(/^\[(?:課題|予定)\]\s*/, '')
          .trim();
        if (description) {
          const detail = document.createElement('p');
          detail.textContent = description;
          card.appendChild(detail);
        }
        section.appendChild(card);
      });

      groupEvents.appendChild(section);
    });
  }

  document.querySelectorAll('[data-group-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const showEvents = tab.dataset.groupTab === 'events';
      document.querySelectorAll('[data-group-tab]').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      document.getElementById('groupOverview').hidden = showEvents;
      document.getElementById('groupEventsView').hidden = !showEvents;
    });
  });

  copyInviteCodeButton?.addEventListener('click', async () => {
    const code = groupInviteCode?.textContent?.replace(/^招待コード：/, '');
    if (!code || code === '取得できませんでした') return;

    try {
      await navigator.clipboard.writeText(code);
      if (shareMessage) shareMessage.textContent = '招待コードをコピーしました。';
    } catch (error) {
      console.error('招待コードのコピーに失敗しました:', error);
      if (shareMessage) shareMessage.textContent = `招待コード：${code}（手動でコピーしてください）`;
    }
  });

  createButton?.addEventListener('click', async () => {
    const name = groupNameInput?.value.trim();

    if (!name) {
      if (shareMessage) shareMessage.textContent = 'グループ名を入力してください。';
      groupNameInput?.focus();
      return;
    }

    createButton.disabled = true;
    createButton.setAttribute('aria-busy', 'true');
    createButton.textContent = '作成中...';
    if (shareMessage) shareMessage.textContent = 'グループを作成しています...';

    try {
      const data = await apiRequest('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      showGroup(data.group);
      await loadGroupDetails(data.group.id);
      await loadGroups();

      if (shareMessage) shareMessage.textContent = 'グループを作成しました！';
    } catch (error) {
      console.error('グループ作成に失敗しました:', error);
      if (shareMessage) {
        shareMessage.textContent = error.message || 'グループを作成できませんでした。';
      }
    } finally {
      createButton.disabled = false;
      createButton.removeAttribute('aria-busy');
      createButton.textContent = 'グループ作成';
    }
  });

  joinButton?.addEventListener('click', async () => {
    const inviteCode = inviteCodeInput?.value.trim();

    if (!inviteCode) {
      if (shareMessage) shareMessage.textContent = '招待コードを入力してください。';
      return;
    }

    joinButton.disabled = true;

    try {
      const data = await apiRequest('/api/groups/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      });

      showGroup(data.group);
      await loadGroupDetails(data.group.id);
      await loadGroups();
      if (shareMessage) {
        shareMessage.textContent = data.message || 'グループに参加しました！';
      }
    } catch (error) {
      if (shareMessage) shareMessage.textContent = error.message;
    } finally {
      joinButton.disabled = false;
    }
  });
});
