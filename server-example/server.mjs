// KaroPay Checkout API（APIキー版）をサーバーから使う例。Node.js 18 以上・依存なし。
//
//   KAROPAY_API_KEY=... node server-example/server.mjs
//
// APIキーは運営が発行する（docs.html#merchant-api）。ブラウザに渡してはいけない。
// このサーバーは:
//   POST /orders              注文を作り、KaroPay の Checkout を作って URL を返す
//   GET  /orders/:id          KaroPay に問い合わせて、支払い済みなら商品を渡す
//   POST /orders/:id/cancel   支払い前の Checkout を取り消す
//   GET  /                    動作確認用の小さな画面

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const API_BASE = (process.env.KAROPAY_API_BASE || 'https://karopay.karon.jp').replace(/\/+$/, '');
const API_KEY = process.env.KAROPAY_API_KEY || '';
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

if (!API_KEY) {
  console.error('KAROPAY_API_KEY を設定してください');
  process.exit(1);
}

// 商品はサーバー側で決める。ブラウザから金額を受け取らない。
const CATALOG = {
  'vip-rank': { name: 'VIP Rank', amount: 500 },
  'vip-monthly': { name: 'VIP Pass', amount: 300, subscription: { interval: 'month', intervalCount: 1 } }
};

// デモ用のメモリ上の注文表。本番は DB に置く。
const orders = new Map();

async function karopay(method, path, body, idempotencyKey) {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function createOrder(itemId) {
  const item = CATALOG[itemId];
  if (!item) throw Object.assign(new Error('UNKNOWN_ITEM'), { status: 400 });

  const orderId = `order_${randomUUID()}`;
  const body = {
    amount: item.amount,
    description: item.name,
    clientReferenceId: orderId,
    successUrl: `${PUBLIC_URL}/?order=${orderId}`,
    cancelUrl: `${PUBLIC_URL}/?order=${orderId}`,
    expiresInMinutes: 30
  };
  if (item.subscription) {
    body.mode = 'subscription';
    body.subscription = item.subscription;
  }

  // 注文 ID を Idempotency-Key にする。通信が切れて再送しても Checkout は 1 つだけ。
  const { checkoutSession, url } = await karopay('POST', '/api/checkout/sessions', body, orderId);
  orders.set(orderId, { id: orderId, itemId, amount: item.amount, sessionId: checkoutSession.id, fulfilled: false });
  return { orderId, url };
}

async function checkOrder(orderId) {
  const order = orders.get(orderId);
  if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });

  const { checkoutSession: session } = await karopay('GET', `/api/checkout/sessions/${encodeURIComponent(order.sessionId)}`);

  // 自分の注文と一致するかを必ず確かめてから渡す
  const matches = session.amount === order.amount && session.clientReferenceId === order.id;
  if (session.status === 'paid' && matches && !order.fulfilled) {
    order.fulfilled = true; // 本番はここで「1 回だけ」商品を渡す（DB の更新と同じトランザクションで）
    order.payerName = session.payerName;
    order.subscriptionId = session.subscription?.id || null;
    console.log(`[fulfill] ${order.id} ${order.itemId} -> ${session.payerName}`);
  }
  return { order, status: session.status, matches };
}

async function cancelOrder(orderId) {
  const order = orders.get(orderId);
  if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
  const { checkoutSession } = await karopay('POST', `/api/checkout/sessions/${encodeURIComponent(order.sessionId)}/cancel`, {});
  return { order, status: checkoutSession.status };
}

const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>KaroPay server example</title>
<body style="font-family:system-ui;max-width:560px;margin:40px auto;padding:0 16px">
<h1>KaroPay server example</h1>
<p><button data-item="vip-rank">VIP Rank を買う ($500)</button>
<button data-item="vip-monthly">VIP Pass に加入 ($300/月)</button></p>
<pre id="out"></pre>
<script>
const out = document.getElementById('out');
for (const b of document.querySelectorAll('button')) b.onclick = async () => {
  const r = await fetch('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: b.dataset.item }) });
  const d = await r.json(); if (d.url) location.href = d.url; else out.textContent = JSON.stringify(d, null, 2);
};
const order = new URLSearchParams(location.search).get('order');
if (order) fetch('/orders/' + encodeURIComponent(order)).then(r => r.json()).then(d => out.textContent = JSON.stringify(d, null, 2));
</script>`;

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) throw Object.assign(new Error('TOO_LARGE'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    if (req.method === 'POST' && url.pathname === '/orders') {
      const { itemId } = await readJson(req);
      return send(res, 201, { ok: true, ...(await createOrder(String(itemId || ''))) });
    }
    const match = url.pathname.match(/^\/orders\/([^/]+)(\/cancel)?$/);
    if (match && req.method === 'GET' && !match[2]) return send(res, 200, { ok: true, ...(await checkOrder(match[1])) });
    if (match && req.method === 'POST' && match[2]) return send(res, 200, { ok: true, ...(await cancelOrder(match[1])) });
    send(res, 404, { ok: false, error: 'NOT_FOUND' });
  } catch (error) {
    send(res, error.status && error.status < 500 ? error.status : 502, { ok: false, error: error.message });
  }
}).listen(PORT, () => console.log(`listening on ${PUBLIC_URL}`));
