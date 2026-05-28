const { getStore } = require('@netlify/blobs');

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  },
  body: JSON.stringify(body)
});

const store = () => getStore('number-baseball-rooms');
const now = () => new Date().toISOString();
const rand = (len = 6) => Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('');
const token = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const normalizeCode = (code) => String(code || '').replace(/\D/g, '').slice(0, 6);

function validateNumber(value) {
  const s = String(value || '').trim();
  if (!/^\d{3}$/.test(s)) return '숫자 3자리로 입력해야 합니다.';
  if (new Set(s).size !== 3) return '서로 다른 숫자 3개를 입력해야 합니다.';
  return null;
}

function score(secret, guess) {
  let strikes = 0;
  let balls = 0;
  for (let i = 0; i < 3; i++) {
    if (guess[i] === secret[i]) strikes++;
    else if (secret.includes(guess[i])) balls++;
  }
  return { strikes, balls, out: strikes === 0 && balls === 0 };
}

async function getRoom(code) {
  if (!code) return null;
  return await store().get(`room:${code}`, { type: 'json' });
}

async function saveRoom(room) {
  room.updatedAt = now();
  await store().setJSON(`room:${room.code}`, room);
}

function publicRoom(room, playerId) {
  const opponentId = playerId === 'p1' ? 'p2' : 'p1';
  const me = room.players[playerId] || null;
  const opponent = room.players[opponentId] || null;
  return {
    code: room.code,
    status: room.status,
    turn: room.turn,
    winner: room.winner,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    me: me ? { id: playerId, name: me.name, secretSet: Boolean(room.secrets[playerId]), secret: room.secrets[playerId] || '' } : null,
    opponent: opponent ? { id: opponentId, name: opponent.name, secretSet: Boolean(room.secrets[opponentId]) } : null,
    players: {
      p1: room.players.p1 ? { name: room.players.p1.name, secretSet: Boolean(room.secrets.p1) } : null,
      p2: room.players.p2 ? { name: room.players.p2.name, secretSet: Boolean(room.secrets.p2) } : null
    },
    logs: room.logs.slice(-30)
  };
}

function requirePlayer(room, playerId, playerToken) {
  if (!['p1', 'p2'].includes(playerId)) return '플레이어 정보가 올바르지 않습니다.';
  if (!room.players[playerId]) return '이 방의 플레이어가 아닙니다.';
  if (room.players[playerId].token !== playerToken) return '접속 정보가 일치하지 않습니다. 방에 다시 입장해 주세요.';
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'POST 요청만 사용할 수 있습니다.' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }

  const action = body.action;

  try {
    if (action === 'create') {
      const name = String(body.name || '방장').trim().slice(0, 12) || '방장';
      let code;
      for (let i = 0; i < 20; i++) {
        code = rand(4);
        if (!(await getRoom(code))) break;
      }
      const pToken = token();
      const room = {
        code,
        status: 'waiting',
        turn: null,
        winner: null,
        createdAt: now(),
        updatedAt: now(),
        players: {
          p1: { name, token: pToken, joinedAt: now() },
          p2: null
        },
        secrets: { p1: null, p2: null },
        logs: []
      };
      await saveRoom(room);
      return json(200, { ok: true, playerId: 'p1', token: pToken, room: publicRoom(room, 'p1') });
    }

    if (action === 'join') {
      const code = normalizeCode(body.code);
      const name = String(body.name || '도전자').trim().slice(0, 12) || '도전자';
      const room = await getRoom(code);
      if (!room) return json(404, { ok: false, error: '방을 찾을 수 없습니다.' });
      if (room.players.p2) return json(409, { ok: false, error: '이미 두 명이 들어온 방입니다.' });
      const pToken = token();
      room.players.p2 = { name, token: pToken, joinedAt: now() };
      room.status = 'setting';
      room.logs.push({ type: 'system', text: `${name} 입장`, createdAt: now() });
      await saveRoom(room);
      return json(200, { ok: true, playerId: 'p2', token: pToken, room: publicRoom(room, 'p2') });
    }

    if (action === 'state') {
      const code = normalizeCode(body.code);
      const { playerId, token: playerToken } = body;
      const room = await getRoom(code);
      if (!room) return json(404, { ok: false, error: '방을 찾을 수 없습니다.' });
      const err = requirePlayer(room, playerId, playerToken);
      if (err) return json(403, { ok: false, error: err });
      return json(200, { ok: true, room: publicRoom(room, playerId) });
    }

    if (action === 'setSecret') {
      const code = normalizeCode(body.code);
      const { playerId, token: playerToken } = body;
      const secret = String(body.secret || '').trim();
      const errNum = validateNumber(secret);
      if (errNum) return json(400, { ok: false, error: errNum });
      const room = await getRoom(code);
      if (!room) return json(404, { ok: false, error: '방을 찾을 수 없습니다.' });
      const err = requirePlayer(room, playerId, playerToken);
      if (err) return json(403, { ok: false, error: err });
      if (room.status === 'finished') return json(409, { ok: false, error: '이미 끝난 게임입니다.' });

      room.secrets[playerId] = secret;
      room.logs.push({ type: 'system', text: `${room.players[playerId].name} 비밀 숫자 등록`, createdAt: now() });
      if (room.players.p1 && room.players.p2 && room.secrets.p1 && room.secrets.p2) {
        room.status = 'playing';
        room.turn = 'p1';
        room.logs.push({ type: 'system', text: '게임 시작! 방장부터 추측합니다.', createdAt: now() });
      } else {
        room.status = room.players.p2 ? 'setting' : 'waiting';
      }
      await saveRoom(room);
      return json(200, { ok: true, room: publicRoom(room, playerId) });
    }

    if (action === 'guess') {
      const code = normalizeCode(body.code);
      const { playerId, token: playerToken } = body;
      const guess = String(body.guess || '').trim();
      const errNum = validateNumber(guess);
      if (errNum) return json(400, { ok: false, error: errNum });
      const room = await getRoom(code);
      if (!room) return json(404, { ok: false, error: '방을 찾을 수 없습니다.' });
      const err = requirePlayer(room, playerId, playerToken);
      if (err) return json(403, { ok: false, error: err });
      if (room.status !== 'playing') return json(409, { ok: false, error: '아직 게임을 시작할 수 없습니다.' });
      if (room.turn !== playerId) return json(409, { ok: false, error: '아직 내 차례가 아닙니다.' });

      const targetId = playerId === 'p1' ? 'p2' : 'p1';
      const result = score(room.secrets[targetId], guess);
      const entry = {
        type: 'guess',
        by: playerId,
        name: room.players[playerId].name,
        guess,
        strikes: result.strikes,
        balls: result.balls,
        out: result.out,
        createdAt: now()
      };
      room.logs.push(entry);

      if (result.strikes === 3) {
        room.status = 'finished';
        room.winner = playerId;
        room.turn = null;
        room.logs.push({ type: 'system', text: `${room.players[playerId].name} 승리!`, createdAt: now() });
      } else {
        room.turn = targetId;
      }
      await saveRoom(room);
      return json(200, { ok: true, result, room: publicRoom(room, playerId) });
    }

    if (action === 'reset') {
      const code = normalizeCode(body.code);
      const { playerId, token: playerToken } = body;
      const room = await getRoom(code);
      if (!room) return json(404, { ok: false, error: '방을 찾을 수 없습니다.' });
      const err = requirePlayer(room, playerId, playerToken);
      if (err) return json(403, { ok: false, error: err });
      room.status = room.players.p2 ? 'setting' : 'waiting';
      room.turn = null;
      room.winner = null;
      room.secrets = { p1: null, p2: null };
      room.logs = [{ type: 'system', text: '새 게임 준비', createdAt: now() }];
      await saveRoom(room);
      return json(200, { ok: true, room: publicRoom(room, playerId) });
    }

    return json(400, { ok: false, error: '알 수 없는 action입니다.' });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, error: '서버 오류가 발생했습니다.', detail: error.message });
  }
};
