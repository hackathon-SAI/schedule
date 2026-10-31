

// 予定の追加処理
async function addSchedule(title, date, startTime, endTime, memo) {
  try {
    await EventCreation.ready;
    const groupId = EventCreation.selectedGroupId('scheduleGroupId');

    if (!groupId) {
      alert('予定の保存先グループを選択してください。');
      return false;
    }

    // 日本時間（+09:00）で日時を作成
    const startIso = `${date}T${startTime}:00+09:00`;
    const endIso = `${date}T${endTime}:00+09:00`;

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      alert('終了時刻は開始時刻より後に設定してください。');
      return false;
    }

    const description = `[予定] ${memo || ''}`;
    let shouldCreate;
    try {
      shouldCreate = await confirmNoSimilarEvent({
        groupId,
        kind: 'schedule',
        title,
        description,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });
    } catch (err) {
      console.error('予定の重複候補確認に失敗しました:', err);
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
        description,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      }),
    });

    if (res.status === 401) {
      window.location.href = 'login.html';
      return false;
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      alert(
        errorData.message ||
        errorData.error ||
        '予定の追加に失敗しました。'
      );
      return false;
    }

    EventCreation.activateGroup(groupId);

    return true;
  } catch (err) {
    console.error('予定追加エラー:', err);
    alert(err.message || '通信エラーが発生しました。');
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const addScheduleButton = document.getElementById('addScheduleButton');
  const scheduleModal = document.getElementById('scheduleModal');
  const closeScheduleModal = document.getElementById('closeScheduleModal');
  const saveScheduleButton = document.getElementById('saveSchedule');

  // フォームをリセットする
  const resetScheduleForm = () => {
    const title = document.getElementById('scheduleTitle');
    const date = document.getElementById('scheduleDate');
    const start = document.getElementById('scheduleStartTime');
    const end = document.getElementById('scheduleEndTime');
    const memo = document.getElementById('scheduleMemo');

    if (title) title.value = '';
    if (date) date.value = '';
    if (start) start.value = '';
    if (end) end.value = '';
    if (memo) memo.value = '';
  };

  // 「＋ 予定追加」でモーダルを開く
  if (addScheduleButton && scheduleModal) {
    addScheduleButton.addEventListener('click', () => {
      scheduleModal.classList.add('active');
      scheduleModal.style.display = 'block';
    });
  }

  // 「×」でモーダルを閉じる
  if (closeScheduleModal && scheduleModal) {
    closeScheduleModal.addEventListener('click', () => {
      scheduleModal.classList.remove('active');
      scheduleModal.style.display = 'none';
      resetScheduleForm();
    });
  }

  // 「保存」ボタン
  if (saveScheduleButton) {
    saveScheduleButton.addEventListener('click', async () => {
      const title = document.getElementById('scheduleTitle')?.value.trim();
      const date = document.getElementById('scheduleDate')?.value;
      const startTime = document.getElementById('scheduleStartTime')?.value;
      const endTime = document.getElementById('scheduleEndTime')?.value;
      const memo = document.getElementById('scheduleMemo')?.value;

      if (!title || !date || !startTime || !endTime) {
        alert('予定名、日付、開始時刻、終了時刻を入力してください。');
        return;
      }

      if (startTime >= endTime) {
        alert('終了時刻は開始時刻より後に設定してください。');
        return;
      }

      const success = await addSchedule(
        title,
        date,
        startTime,
        endTime,
        memo
      );

      if (success) {
        resetScheduleForm();

        if (scheduleModal) {
          scheduleModal.classList.remove('active');
          scheduleModal.style.display = 'none';
        }
      }
    });
  }
});
