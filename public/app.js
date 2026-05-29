import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const els = {
  connectionStatus: $('connectionStatus'),
  loginCard: $('loginCard'),
  lobbyCard: $('lobbyCard'),
  gameCard: $('gameCard'),
  playerNameInput: $('playerNameInput'),
  loginBtn: $('loginBtn'),
  currentName: $('currentName'),
  logoutNameBtn: $('logoutNameBtn'),
  createRoomBtn: $('createRoomBtn'),
  roomCodeInput: $('roomCodeInput'),
  joinRoomBtn: $('joinRoomBtn'),
  roomCodeTitle: $('roomCodeTitle'),
  roomStatusText: $('roomStatusText'),
  hostNameText: $('hostNameText'),
  guestNameText: $('guestNameText'),
  hostReadyText: $('hostReadyText'),
  guestReadyText: $('guestReadyText'),
  hostPanel: $('hostPanel'),
  guestPanel: $('guestPanel'),
  secretArea: $('secretArea'),
  secretInput: $('secretInput'),
  saveSecretBtn: $('saveSecretBtn'),
  guessArea: $('guessArea'),
  turnHint: $('turnHint'),
  guessInput: $('guessInput'),
  guessBtn: $('guessBtn'),
  numberBoard: $('numberBoard'),
  numberGrid: $('numberGrid'),
  drawArea: $('drawArea'),
  requestDrawBtn: $('requestDrawBtn'),
  drawStatusText: $('drawStatusText'),
  drawModal: $('drawModal'),
  acceptDrawBtn: $('acceptDrawBtn'),
  denyDrawBtn: $('denyDrawBtn'),
  finishedArea: $('finishedArea'),
  historyList: $('historyList'),
  leaveRoomBtn: $('leaveRoomBtn'),
  resetGameBtn: $('resetGameBtn'),
  rankingBody: $('rankingBody'),
  refreshRankBtn: $('refreshRankBtn'),
  toast: $('toast')
};

let currentUser = null;
let player = null;
let currentRoomCode = localStorage.getItem('nb_roomCode') || '';
let pollTimer = null;
let rankTimer = null;
let lastRoom = null;
let shownDrawRequestKey = '';

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidThreeDigits(value) {
  const v = cleanDigits(value);
  return v.length === 3 && new Set(v.split('')).size === 3;
}

function makeRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getRole(room) {
  if (!currentUser || !room) return null;
  if (room.hostUid === currentUser.uid) return 'host';
  if (room.guestUid === currentUser.uid) return 'guest';
  return null;
}

function opponentRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

function nextTurn(role) {
  return role === 'host' ? 'guest' : 'host';
}

function calcResult(secret, guess) {
  let strikes = 0;
  let balls = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) strikes++;
    else if (secret.includes(guess[i])) balls++;
  }
  return { strikes, balls, out: strikes === 0 && balls === 0 };
}

function resultLabel(result) {
  if (result.out) return '아웃';
  return `${result.strikes}S ${result.balls}B`;
}

function showScreen(state) {
  els.loginCard.classList.toggle('hidden', state !== 'login');
  els.lobbyCard.classList.toggle('hidden', state === 'login' || state === 'game');
  els.gameCard.classList.toggle('hidden', state !== 'game');
}

async function ensurePlayer(name) {
  if (!currentUser) throw new Error('로그인이 필요합니다.');
  const ref = doc(db, 'players', currentUser.uid);
  const snap = await getDoc(ref);
  const trimmedName = name.trim();
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: currentUser.uid,
      name: trimmedName,
      wins: 0,
      losses: 0,
      games: 0,
      points: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    await updateDoc(ref, {
      name: trimmedName,
      updatedAt: serverTimestamp()
    });
  }
  player = { uid: currentUser.uid, name: trimmedName };
  localStorage.setItem('nb_playerName', trimmedName);
  els.currentName.textContent = trimmedName;
}

async function loginWithName() {
  const name = els.playerNameInput.value.trim();
  if (name.length < 2) {
    showToast('이름을 2글자 이상 입력하세요.');
    return;
  }
  els.loginBtn.disabled = true;
  try {
    if (!currentUser) await signInAnonymously(auth);
    await ensurePlayer(name);
    showScreen('lobby');
    els.connectionStatus.textContent = '입장 완료';
    await loadRanking();
  } catch (error) {
    showToast(`로그인 오류: ${error.message}`);
  } finally {
    els.loginBtn.disabled = false;
  }
}

async function createRoom() {
  if (!player) return showToast('먼저 이름으로 입장하세요.');
  els.createRoomBtn.disabled = true;
  try {
    let code = makeRoomCode();
    let ref = doc(db, 'numberBaseballRooms', code);
    let snap = await getDoc(ref);
    let count = 0;
    while (snap.exists() && count < 8) {
      code = makeRoomCode();
      ref = doc(db, 'numberBaseballRooms', code);
      snap = await getDoc(ref);
      count++;
    }
    if (snap.exists()) throw new Error('방 코드 생성에 실패했습니다. 다시 눌러주세요.');

    await setDoc(ref, {
      roomCode: code,
      status: 'waiting',
      hostUid: currentUser.uid,
      hostName: player.name,
      guestUid: null,
      guestName: null,
      hostSecret: null,
      guestSecret: null,
      turn: 'host',
      history: [],
      winnerUid: null,
      loserUid: null,
      rankingApplied: false,
      drawRequest: null,
      drawAcceptedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    enterRoom(code);
    showToast(`방이 만들어졌습니다. 방 코드: ${code}`);
  } catch (error) {
    showToast(`방 만들기 오류: ${error.message}`);
  } finally {
    els.createRoomBtn.disabled = false;
  }
}

async function joinRoom() {
  if (!player) return showToast('먼저 이름으로 입장하세요.');
  const code = cleanDigits(els.roomCodeInput.value);
  if (code.length !== 4) return showToast('방 코드 4자리를 입력하세요.');
  const ref = doc(db, 'numberBaseballRooms', code);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('없는 방 코드입니다.');
      const room = snap.data();
      if (room.status === 'finished' || room.status === 'draw') throw new Error('이미 끝난 방입니다.');
      if (room.hostUid === currentUser.uid || room.guestUid === currentUser.uid) return;
      if (room.guestUid) throw new Error('이미 참가자가 있는 방입니다.');
      tx.update(ref, {
        guestUid: currentUser.uid,
        guestName: player.name,
        status: 'ready',
        updatedAt: serverTimestamp()
      });
    });
    enterRoom(code);
    showToast('방에 입장했습니다.');
  } catch (error) {
    showToast(`입장 오류: ${error.message}`);
  }
}

function enterRoom(code) {
  currentRoomCode = code;
  localStorage.setItem('nb_roomCode', code);
  els.roomCodeTitle.textContent = code;
  showScreen('game');
  startPolling();
  refreshRoom();
}

function leaveRoom() {
  currentRoomCode = '';
  lastRoom = null;
  localStorage.removeItem('nb_roomCode');
  stopPolling();
  showScreen('lobby');
}

async function saveSecret() {
  if (!currentRoomCode) return;
  const secret = cleanDigits(els.secretInput.value);
  if (!isValidThreeDigits(secret)) return showToast('서로 다른 숫자 3개를 입력하세요. 예: 427');

  const ref = doc(db, 'numberBaseballRooms', currentRoomCode);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('방을 찾을 수 없습니다.');
      const room = snap.data();
      const role = getRole(room);
      if (!role) throw new Error('이 방의 참가자가 아닙니다.');
      const update = { updatedAt: serverTimestamp() };
      update[`${role}Secret`] = secret;
      const other = opponentRole(role);
      const otherSecret = room[`${other}Secret`];
      if (otherSecret) update.status = 'playing';
      else update.status = room.guestUid ? 'ready' : 'waiting';
      tx.update(ref, update);
    });
    els.secretInput.value = '';
    showToast('비밀 숫자를 등록했습니다.');
    refreshRoom();
  } catch (error) {
    showToast(`등록 오류: ${error.message}`);
  }
}

async function submitGuess() {
  if (!currentRoomCode) return;
  const guess = cleanDigits(els.guessInput.value);
  if (!isValidThreeDigits(guess)) return showToast('서로 다른 숫자 3개를 입력하세요. 예: 815');

  const ref = doc(db, 'numberBaseballRooms', currentRoomCode);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('방을 찾을 수 없습니다.');
      const room = snap.data();
      const role = getRole(room);
      if (!role) throw new Error('이 방의 참가자가 아닙니다.');
      if (room.status !== 'playing') throw new Error('아직 게임을 시작할 수 없습니다.');
      if (room.turn !== role) throw new Error('아직 내 차례가 아닙니다.');

      const target = opponentRole(role);
      const secret = room[`${target}Secret`];
      if (!secret) throw new Error('상대가 아직 비밀 숫자를 등록하지 않았습니다.');

      const result = calcResult(secret, guess);
      const entry = {
        byUid: currentUser.uid,
        byName: player.name,
        role,
        guess,
        strikes: result.strikes,
        balls: result.balls,
        out: result.out,
        label: resultLabel(result),
        at: Date.now()
      };
      const history = [...(room.history || []), entry].slice(-60);
      const update = {
        history,
        updatedAt: serverTimestamp()
      };
      if (result.strikes === 3) {
        update.status = 'finished';
        update.winnerUid = currentUser.uid;
        update.winnerName = player.name;
        update.loserUid = room[`${target}Uid`];
        update.loserName = room[`${target}Name`];
        update.finishedAt = serverTimestamp();
        update.turn = null;
      } else {
        update.turn = nextTurn(role);
      }
      tx.update(ref, update);
    });
    els.guessInput.value = '';
    await refreshRoom();
  } catch (error) {
    showToast(`제출 오류: ${error.message}`);
  }
}

async function applyRankingIfNeeded(room) {
  if (!room || room.status !== 'finished' || room.rankingApplied || !room.winnerUid || !room.loserUid) return;
  const roomRef = doc(db, 'numberBaseballRooms', room.roomCode);
  const winnerRef = doc(db, 'players', room.winnerUid);
  const loserRef = doc(db, 'players', room.loserUid);
  const matchRef = doc(collection(db, 'matches'));

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) return;
    const freshRoom = roomSnap.data();
    if (freshRoom.rankingApplied || freshRoom.status !== 'finished') return;

    const winnerSnap = await tx.get(winnerRef);
    const loserSnap = await tx.get(loserRef);
    const winner = winnerSnap.exists() ? winnerSnap.data() : { name: freshRoom.winnerName, wins: 0, losses: 0, games: 0, points: 0 };
    const loser = loserSnap.exists() ? loserSnap.data() : { name: freshRoom.loserName, wins: 0, losses: 0, games: 0, points: 0 };

    tx.set(winnerRef, {
      uid: freshRoom.winnerUid,
      name: winner.name || freshRoom.winnerName,
      wins: (winner.wins || 0) + 1,
      losses: winner.losses || 0,
      games: (winner.games || 0) + 1,
      points: (winner.points || 0) + 3,
      updatedAt: serverTimestamp()
    }, { merge: true });

    tx.set(loserRef, {
      uid: freshRoom.loserUid,
      name: loser.name || freshRoom.loserName,
      wins: loser.wins || 0,
      losses: (loser.losses || 0) + 1,
      games: (loser.games || 0) + 1,
      points: loser.points || 0,
      updatedAt: serverTimestamp()
    }, { merge: true });

    tx.set(matchRef, {
      roomCode: freshRoom.roomCode,
      winnerUid: freshRoom.winnerUid,
      winnerName: freshRoom.winnerName,
      loserUid: freshRoom.loserUid,
      loserName: freshRoom.loserName,
      historyLength: (freshRoom.history || []).length,
      finishedAt: serverTimestamp()
    });

    tx.update(roomRef, { rankingApplied: true, updatedAt: serverTimestamp() });
  });
}

async function resetSameRoom() {
  if (!currentRoomCode || !lastRoom) return;
  const role = getRole(lastRoom);
  if (role !== 'host') return showToast('같은 방 새 게임은 방장만 누를 수 있습니다.');
  const ref = doc(db, 'numberBaseballRooms', currentRoomCode);
  try {
    await updateDoc(ref, {
      status: lastRoom.guestUid ? 'ready' : 'waiting',
      hostSecret: null,
      guestSecret: null,
      turn: 'host',
      history: [],
      winnerUid: null,
      winnerName: null,
      loserUid: null,
      loserName: null,
      rankingApplied: false,
      drawRequest: null,
      drawAcceptedAt: null,
      finishedAt: null,
      updatedAt: serverTimestamp()
    });
    showToast('같은 방에서 새 게임을 시작합니다.');
    refreshRoom();
  } catch (error) {
    showToast(`새 게임 오류: ${error.message}`);
  }
}

async function requestDraw() {
  if (!currentRoomCode || !lastRoom) return;
  const role = getRole(lastRoom);
  if (!role) return showToast('이 방의 참가자가 아닙니다.');
  if (lastRoom.status !== 'playing') return showToast('게임 진행 중에만 무승부를 요청할 수 있습니다.');
  if (lastRoom.drawRequest && lastRoom.drawRequest.status === 'pending') {
    return showToast('이미 무승부 요청이 진행 중입니다.');
  }
  const ok = confirm('상대에게 무승부를 요청할까요? 상대가 승인하면 랭킹에 반영하지 않고 경기가 끝납니다.');
  if (!ok) return;

  const ref = doc(db, 'numberBaseballRooms', currentRoomCode);
  try {
    await updateDoc(ref, {
      drawRequest: {
        status: 'pending',
        byUid: currentUser.uid,
        byName: player.name,
        byRole: role,
        at: Date.now()
      },
      updatedAt: serverTimestamp()
    });
    showToast('무승부를 요청했습니다. 상대의 승인을 기다립니다.');
    await refreshRoom();
  } catch (error) {
    showToast(`무승부 요청 오류: ${error.message}`);
  }
}

async function acceptDraw() {
  if (!currentRoomCode || !lastRoom) return;
  const req = lastRoom.drawRequest;
  if (!req || req.status !== 'pending') return;
  const ref = doc(db, 'numberBaseballRooms', currentRoomCode);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('방을 찾을 수 없습니다.');
      const room = snap.data();
      const freshReq = room.drawRequest;
      if (!freshReq || freshReq.status !== 'pending') return;
      if (freshReq.byUid === currentUser.uid) throw new Error('내가 보낸 요청은 내가 승인할 수 없습니다.');
      tx.update(ref, {
        status: 'draw',
        turn: null,
        winnerUid: null,
        winnerName: null,
        loserUid: null,
        loserName: null,
        rankingApplied: true,
        drawRequest: { ...freshReq, status: 'accepted', acceptedByUid: currentUser.uid, acceptedByName: player.name, acceptedAt: Date.now() },
        drawAcceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    hideDrawModal();
    showToast('무승부로 경기가 종료되었습니다. 랭킹에는 반영되지 않습니다.');
    await refreshRoom();
  } catch (error) {
    showToast(`무승부 승인 오류: ${error.message}`);
  }
}

async function denyDraw() {
  if (!currentRoomCode || !lastRoom) return;
  const req = lastRoom.drawRequest;
  if (!req || req.status !== 'pending') return hideDrawModal();
  const ref = doc(db, 'numberBaseballRooms', currentRoomCode);
  try {
    await updateDoc(ref, {
      drawRequest: { ...req, status: 'denied', deniedByUid: currentUser.uid, deniedByName: player.name, deniedAt: Date.now() },
      updatedAt: serverTimestamp()
    });
    hideDrawModal();
    showToast('무승부 요청을 거절했습니다.');
    await refreshRoom();
  } catch (error) {
    showToast(`무승부 거절 오류: ${error.message}`);
  }
}

function showDrawModal() {
  if (els.drawModal) els.drawModal.classList.remove('hidden');
}

function hideDrawModal() {
  if (els.drawModal) els.drawModal.classList.add('hidden');
}

function handleDrawRequestPrompt(room) {
  const req = room.drawRequest;
  if (!req || req.status !== 'pending' || !currentUser) {
    hideDrawModal();
    return;
  }
  if (req.byUid === currentUser.uid) {
    hideDrawModal();
    return;
  }
  const key = `${room.roomCode}-${req.byUid}-${req.at || ''}`;
  if (shownDrawRequestKey !== key) {
    shownDrawRequestKey = key;
    showDrawModal();
  }
}


function getMyHistory(history) {
  if (!currentUser) return [];
  return (history || []).filter((h) => h.byUid === currentUser.uid);
}

function getEliminatedDigits(history) {
  const eliminated = new Set();
  getMyHistory(history).forEach((h) => {
    const strikes = Number(h.strikes ?? 0);
    const balls = Number(h.balls ?? 0);
    const label = String(h.label || '');
    const isOut = h.out === true || label.includes('아웃') || (strikes === 0 && balls === 0);

    if (isOut) {
      String(h.guess || '')
        .replace(/\D/g, '')
        .split('')
        .forEach((digit) => eliminated.add(digit));
    }
  });
  return eliminated;
}

function renderNumberBoard(history) {
  if (!els.numberGrid) return;
  const eliminated = getEliminatedDigits(history);
  els.numberGrid.innerHTML = '';
  '0123456789'.split('').forEach((digit) => {
    const item = document.createElement('span');
    item.className = 'numberChip';
    item.textContent = digit;
    if (eliminated.has(digit)) {
      item.classList.add('eliminated');
      item.title = '아웃 결과로 제외된 숫자입니다.';
    } else {
      item.title = '아직 가능성이 남아 있는 숫자입니다.';
    }
    els.numberGrid.appendChild(item);
  });
}

async function refreshRoom() {
  if (!currentRoomCode) return;
  try {
    const snap = await getDoc(doc(db, 'numberBaseballRooms', currentRoomCode));
    if (!snap.exists()) {
      showToast('방이 사라졌습니다. 대기실로 돌아갑니다.');
      leaveRoom();
      return;
    }
    const room = snap.data();
    room.roomCode = currentRoomCode;
    lastRoom = room;
    renderRoom(room);
    if (room.status === 'finished' && !room.rankingApplied) {
      await applyRankingIfNeeded(room);
      await loadRanking();
      const updated = await getDoc(doc(db, 'numberBaseballRooms', currentRoomCode));
      if (updated.exists()) renderRoom({ ...updated.data(), roomCode: currentRoomCode });
    }
  } catch (error) {
    showToast(`갱신 오류: ${error.message}`);
  }
}

function renderRoom(room) {
  const role = getRole(room);
  const mySecret = role ? room[`${role}Secret`] : null;
  const other = role ? opponentRole(role) : null;

  els.roomCodeTitle.textContent = room.roomCode;
  els.hostNameText.textContent = room.hostName || '-';
  els.guestNameText.textContent = room.guestName || '대기 중';
  els.hostReadyText.textContent = room.hostSecret ? '비밀 숫자 등록 완료' : '비밀 숫자 미등록';
  els.guestReadyText.textContent = room.guestSecret ? '비밀 숫자 등록 완료' : '비밀 숫자 미등록';

  const statusMap = {
    waiting: '상대 입장 대기 중',
    ready: '비밀 숫자 등록 중',
    playing: room.turn === role ? '내 차례' : '상대 차례',
    finished: '게임 종료',
    draw: '무승부 종료'
  };
  els.roomStatusText.textContent = statusMap[room.status] || room.status;

  els.hostPanel.classList.toggle('myTurn', room.status === 'playing' && room.turn === 'host');
  els.guestPanel.classList.toggle('myTurn', room.status === 'playing' && room.turn === 'guest');

  const canSetSecret = role && room.status !== 'finished' && room.status !== 'draw' && !mySecret && !!room.guestUid;
  els.secretArea.classList.toggle('hidden', !canSetSecret);

  const canGuess = role && room.status === 'playing' && room.turn === role;
  els.guessArea.classList.toggle('hidden', room.status !== 'playing');
  els.guessBtn.disabled = !canGuess;
  els.guessInput.disabled = !canGuess;
  els.turnHint.textContent = canGuess
    ? '내 차례입니다. 상대의 비밀 숫자를 추측하세요.'
    : `상대(${room[`${other}Name`] || '친구'})의 차례입니다. 2초마다 자동 갱신됩니다.`;

  const isEnded = room.status === 'finished' || room.status === 'draw';
  els.finishedArea.classList.toggle('hidden', !isEnded);
  if (room.status === 'finished') {
    const winText = room.winnerUid === currentUser?.uid ? '승리했습니다! 🎉' : `${room.winnerName}님이 승리했습니다.`;
    els.finishedArea.textContent = `${winText} 랭킹에 결과가 반영됩니다.`;
  } else if (room.status === 'draw') {
    els.finishedArea.textContent = '무승부로 경기가 종료되었습니다. 승패와 랭킹에는 반영되지 않습니다.';
  }

  const drawPending = room.drawRequest && room.drawRequest.status === 'pending';
  const requestedByMe = drawPending && room.drawRequest.byUid === currentUser?.uid;
  const showDrawArea = role && room.status === 'playing';
  els.drawArea.classList.toggle('hidden', !showDrawArea);
  els.requestDrawBtn.disabled = !!drawPending;
  els.drawStatusText.textContent = drawPending
    ? (requestedByMe ? '무승부 요청을 보냈습니다. 상대의 승인을 기다리는 중입니다.' : `${room.drawRequest.byName || '상대'}님이 무승부를 요청했습니다. 팝업에서 승인 또는 거절하세요.`)
    : '상대가 승인하면 랭킹에 반영하지 않고 경기를 종료합니다.';

  handleDrawRequestPrompt(room);

  const showEndActions = isEnded;
  els.leaveRoomBtn.classList.toggle('hidden', !showEndActions);
  els.resetGameBtn.classList.toggle('hidden', !showEndActions);
  els.resetGameBtn.disabled = role !== 'host';

  const showBoard = role && (room.status === 'playing' || room.status === 'finished' || room.status === 'draw');
  els.numberBoard.classList.toggle('hidden', !showBoard);
  renderNumberBoard(room.history || []);
  renderHistory(room.history || []);
}

function renderHistory(history) {
  els.historyList.innerHTML = '';
  const myHistory = getMyHistory(history);
  if (!myHistory.length) {
    const li = document.createElement('li');
    li.textContent = '아직 내가 추측한 기록이 없습니다.';
    els.historyList.appendChild(li);
    return;
  }
  [...myHistory].reverse().forEach((h, idx) => {
    const li = document.createElement('li');
    li.textContent = `${myHistory.length - idx}. ${h.guess} : ${h.label}`;
    els.historyList.appendChild(li);
  });
}

async function loadRanking() {
  try {
    const q = query(collection(db, 'players'), orderBy('points', 'desc'), orderBy('wins', 'desc'), limit(30));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach((docSnap) => rows.push(docSnap.data()));
    rows.sort((a, b) => {
      const winRateA = (a.games || 0) ? (a.wins || 0) / (a.games || 1) : 0;
      const winRateB = (b.games || 0) ? (b.wins || 0) / (b.games || 1) : 0;
      return (b.points || 0) - (a.points || 0) || winRateB - winRateA || (b.games || 0) - (a.games || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });

    els.rankingBody.innerHTML = '';
    if (!rows.length) {
      els.rankingBody.innerHTML = '<tr><td colspan="6">아직 랭킹 기록이 없습니다.</td></tr>';
      return;
    }
    rows.forEach((p, index) => {
      const games = p.games || 0;
      const rate = games ? Math.round(((p.wins || 0) / games) * 100) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(p.name || '-')}</td>
        <td>${p.wins || 0}</td>
        <td>${p.losses || 0}</td>
        <td><strong>${p.points || 0}</strong></td>
        <td>${rate}%</td>
      `;
      els.rankingBody.appendChild(tr);
    });
  } catch (error) {
    els.rankingBody.innerHTML = `<tr><td colspan="6">랭킹 오류: ${escapeHtml(error.message)}</td></tr>`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(refreshRoom, 2000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startRankPolling() {
  if (rankTimer) clearInterval(rankTimer);
  rankTimer = setInterval(loadRanking, 5000);
}

els.loginBtn.addEventListener('click', loginWithName);
els.playerNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginWithName(); });
els.logoutNameBtn.addEventListener('click', () => {
  localStorage.removeItem('nb_playerName');
  player = null;
  leaveRoom();
  showScreen('login');
});
els.createRoomBtn.addEventListener('click', createRoom);
els.joinRoomBtn.addEventListener('click', joinRoom);
els.roomCodeInput.addEventListener('input', (e) => { e.target.value = cleanDigits(e.target.value).slice(0, 4); });
els.secretInput.addEventListener('input', (e) => { e.target.value = cleanDigits(e.target.value).slice(0, 3); });
els.guessInput.addEventListener('input', (e) => { e.target.value = cleanDigits(e.target.value).slice(0, 3); });
els.saveSecretBtn.addEventListener('click', saveSecret);
els.guessBtn.addEventListener('click', submitGuess);
els.requestDrawBtn.addEventListener('click', requestDraw);
els.acceptDrawBtn.addEventListener('click', acceptDraw);
els.denyDrawBtn.addEventListener('click', denyDraw);
els.leaveRoomBtn.addEventListener('click', leaveRoom);
els.resetGameBtn.addEventListener('click', resetSameRoom);
els.refreshRankBtn.addEventListener('click', loadRanking);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    try { await signInAnonymously(auth); }
    catch (error) { showToast(`Firebase 로그인 오류: ${error.message}`); }
    return;
  }
  els.connectionStatus.textContent = 'Firebase 연결됨';
  const savedName = localStorage.getItem('nb_playerName');
  if (savedName) {
    els.playerNameInput.value = savedName;
    try {
      await ensurePlayer(savedName);
      showScreen(currentRoomCode ? 'game' : 'lobby');
      if (currentRoomCode) enterRoom(currentRoomCode);
      await loadRanking();
    } catch (error) {
      showToast(`사용자 정보 오류: ${error.message}`);
      showScreen('login');
    }
  } else {
    showScreen('login');
  }
  startRankPolling();
});
