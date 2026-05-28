const $ = (id) => document.getElementById(id);
const API = '/.netlify/functions/game';
let session = JSON.parse(localStorage.getItem('numberBaseballSession') || 'null');
let pollTimer = null;

function saveSession(next) {
  session = next;
  localStorage.setItem('numberBaseballSession', JSON.stringify(session));
}
function clearSession() {
  session = null;
  localStorage.removeItem('numberBaseballSession');
}
function setMessage(text, ok = false) {
  $('message').textContent = text || '';
  $('message').style.color = ok ? '#166534' : '#dc2626';
  if (text) setTimeout(() => { if ($('message').textContent === text) $('message').textContent = ''; }, 3200);
}
function onlyDigits(input, max) {
  input.value = input.value.replace(/\D/g, '').slice(0, max);
}
function valid3(value) {
  return /^\d{3}$/.test(value) && new Set(value).size === 3;
}
async function request(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || '요청 실패'));
  return data;
}
function showGame() {
  $('startPanel').classList.add('hidden');
  $('gamePanel').classList.remove('hidden');
}
function showStart() {
  $('startPanel').classList.remove('hidden');
  $('gamePanel').classList.add('hidden');
  if (pollTimer) clearInterval(pollTimer);
}
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshState, 2000);
}
function statusText(room) {
  if (room.status === 'waiting') return '상대가 방 코드로 들어오기를 기다리는 중입니다.';
  if (room.status === 'setting') return '두 사람이 각자 비밀 숫자를 등록하는 중입니다.';
  if (room.status === 'playing') return room.turn === room.me.id ? '내 차례입니다. 상대 숫자를 추측하세요.' : '상대 차례입니다. 잠시 기다리세요.';
  if (room.status === 'finished') return room.winner === room.me.id ? '승리! 상대 숫자를 맞혔습니다.' : '패배! 상대가 먼저 숫자를 맞혔습니다.';
  return '상태 확인 중입니다.';
}
function render(room) {
  showGame();
  $('roomCode').textContent = room.code;
  $('myName').textContent = room.me?.name || '-';
  $('opponentName').textContent = room.opponent?.name || '대기 중';
  $('mySecretStatus').textContent = room.me?.secretSet ? '등록 완료' : '비밀 숫자 미등록';
  $('opponentSecretStatus').textContent = room.opponent ? (room.opponent.secretSet ? '등록 완료' : '비밀 숫자 미등록') : '입장 전';
  $('statusBox').textContent = statusText(room);

  const canSetSecret = room.status !== 'finished' && room.opponent && !room.me.secretSet;
  $('secretPanel').classList.toggle('hidden', !canSetSecret);

  const playing = room.status === 'playing';
  $('guessPanel').classList.toggle('hidden', !playing);
  $('guessBtn').disabled = !(playing && room.turn === room.me.id);
  $('guessInput').disabled = !(playing && room.turn === room.me.id);
  $('turnNotice').textContent = playing && room.turn === room.me.id ? '지금 내 차례입니다.' : '상대가 추측하고 있습니다.';

  $('logList').innerHTML = '';
  const logs = [...room.logs].reverse();
  if (logs.length === 0) {
    $('logList').innerHTML = '<li class="system">아직 기록이 없습니다.</li>';
    return;
  }
  for (const log of logs) {
    const li = document.createElement('li');
    if (log.type === 'system') {
      li.className = 'system';
      li.textContent = log.text;
    } else {
      const mine = log.by === room.me.id ? '나' : '상대';
      const result = log.out ? '아웃' : `${log.strikes}S ${log.balls}B`;
      li.textContent = `${mine}(${log.name}) 추측: ${log.guess} → ${result}`;
    }
    $('logList').appendChild(li);
  }
}
async function refreshState() {
  if (!session) return;
  try {
    const data = await request({ action: 'state', ...session });
    render(data.room);
  } catch (e) {
    setMessage(e.message);
  }
}

$('nameInput').value = localStorage.getItem('numberBaseballName') || '';
$('secretInput').addEventListener('input', () => onlyDigits($('secretInput'), 3));
$('guessInput').addEventListener('input', () => onlyDigits($('guessInput'), 3));
$('codeInput').addEventListener('input', () => onlyDigits($('codeInput'), 4));

$('createBtn').addEventListener('click', async () => {
  try {
    const name = $('nameInput').value.trim() || '방장';
    localStorage.setItem('numberBaseballName', name);
    const data = await request({ action: 'create', name });
    saveSession({ code: data.room.code, playerId: data.playerId, token: data.token });
    render(data.room);
    startPolling();
    setMessage('방을 만들었습니다. 방 코드를 상대에게 알려주세요.', true);
  } catch (e) { setMessage(e.message); }
});

$('joinBtn').addEventListener('click', async () => {
  try {
    const name = $('nameInput').value.trim() || '도전자';
    const code = $('codeInput').value.trim();
    if (code.length !== 4) return setMessage('방 코드 4자리를 입력하세요.');
    localStorage.setItem('numberBaseballName', name);
    const data = await request({ action: 'join', code, name });
    saveSession({ code: data.room.code, playerId: data.playerId, token: data.token });
    render(data.room);
    startPolling();
    setMessage('방에 입장했습니다.', true);
  } catch (e) { setMessage(e.message); }
});

$('secretBtn').addEventListener('click', async () => {
  const secret = $('secretInput').value.trim();
  if (!valid3(secret)) return setMessage('서로 다른 숫자 3개를 입력하세요. 예: 427');
  try {
    const data = await request({ action: 'setSecret', secret, ...session });
    render(data.room);
    $('secretInput').value = '';
    setMessage('비밀 숫자를 등록했습니다.', true);
  } catch (e) { setMessage(e.message); }
});

$('guessBtn').addEventListener('click', async () => {
  const guess = $('guessInput').value.trim();
  if (!valid3(guess)) return setMessage('서로 다른 숫자 3개를 입력하세요. 예: 789');
  try {
    const data = await request({ action: 'guess', guess, ...session });
    render(data.room);
    $('guessInput').value = '';
  } catch (e) { setMessage(e.message); }
});

$('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('roomCode').textContent);
    setMessage('방 코드를 복사했습니다.', true);
  } catch {
    setMessage('복사에 실패했습니다. 코드를 직접 알려주세요.');
  }
});

$('resetBtn').addEventListener('click', async () => {
  if (!confirm('현재 게임 기록을 지우고 새 게임을 준비할까요?')) return;
  try {
    const data = await request({ action: 'reset', ...session });
    render(data.room);
  } catch (e) { setMessage(e.message); }
});

$('leaveBtn').addEventListener('click', () => {
  clearSession();
  showStart();
});

if (session) {
  refreshState();
  startPolling();
}
