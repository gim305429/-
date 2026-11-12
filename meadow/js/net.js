// 방 코드 멀티플레이 연결. 기본은 PeerJS(WebRTC), 주소에 ?net=local 이 있으면 같은 브라우저 탭끼리 연결(테스트용).
const PREFIX = 'meadow-exp-v1-';
const useLocal = new URLSearchParams(location.search).get('net') === 'local';

export function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('연결 라이브러리를 불러오지 못했어요')); document.head.appendChild(s); });
}
function peerOpts() {
  const u = new URLSearchParams(location.search);
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
  if (u.get('peerhost')) { o.host = u.get('peerhost'); o.port = +(u.get('peerport') || 443); o.path = u.get('peerpath') || '/'; o.secure = u.get('secure') !== '0'; }
  return o;
}
const timeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// 방장: onJoin(id), onMsg(id, msg), onLeave(id)
export async function hostRoom(handlers) {
  if (useLocal) {
    const code = genCode(), ch = new BroadcastChannel('meadow-' + code), peers = new Set();
    ch.onmessage = ({ data }) => {
      if (data.to !== 'host') return;
      if (data.msg === '__join') { peers.add(data.from); handlers.onJoin(data.from); return; }
      if (data.msg === '__leave') { peers.delete(data.from); handlers.onLeave(data.from); return; }
      handlers.onMsg(data.from, data.msg);
    };
    return { code, send: (id, msg) => ch.postMessage({ to: id, msg }), broadcast: msg => ch.postMessage({ to: '*', msg }), close: () => { ch.postMessage({ to: '*', msg: { t: 'closed' } }); ch.close(); } };
  }
  await loadPeer();
  for (let tries = 0; tries < 4; tries++) {
    const code = genCode();
    try {
      const peer = new window.Peer(PREFIX + code, peerOpts());
      await timeout(new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); }), 10000, '연결 서버에 닿지 않아요');
      const conns = new Map();
      peer.on('connection', conn => {
        conn.on('open', () => { conns.set(conn.peer, conn); handlers.onJoin(conn.peer); });
        conn.on('data', d => handlers.onMsg(conn.peer, d));
        conn.on('close', () => { conns.delete(conn.peer); handlers.onLeave(conn.peer); });
        conn.on('error', () => { conns.delete(conn.peer); handlers.onLeave(conn.peer); });
      });
      return { code, send: (id, msg) => { const c = conns.get(id); if (c && c.open) c.send(msg); }, broadcast: msg => { for (const c of conns.values()) if (c.open) c.send(msg); }, close: () => { try { peer.destroy(); } catch (e) { } } };
    } catch (e) { if (tries === 3 || !/unavailable-id|ID/.test(String(e.type || e.message))) throw e; }
  }
}

// 참가자: onMsg(msg), onClose()
export async function joinRoom(code, handlers) {
  code = code.trim().toUpperCase();
  if (useLocal) {
    const me = 'c' + Math.random().toString(36).slice(2, 8), ch = new BroadcastChannel('meadow-' + code);
    ch.onmessage = ({ data }) => { if (data.to !== me && data.to !== '*') return; if (data.msg?.t === 'closed') { handlers.onClose(); return; } handlers.onMsg(data.msg); };
    ch.postMessage({ to: 'host', from: me, msg: '__join' });
    return { id: me, send: msg => ch.postMessage({ to: 'host', from: me, msg }), close: () => { ch.postMessage({ to: 'host', from: me, msg: '__leave' }); ch.close(); } };
  }
  await loadPeer();
  const peer = new window.Peer(peerOpts());
  await timeout(new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); }), 10000, '연결 서버에 닿지 않아요');
  const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
  await timeout(new Promise((res, rej) => { conn.on('open', res); peer.on('error', e => rej(new Error(e.type === 'peer-unavailable' ? '방을 찾을 수 없어요' : '연결에 실패했어요'))); }), 12000, '방에 연결하지 못했어요');
  conn.on('data', d => handlers.onMsg(d));
  conn.on('close', () => handlers.onClose());
  return { id: peer.id, send: msg => { if (conn.open) conn.send(msg); }, close: () => { try { peer.destroy(); } catch (e) { } } };
}
