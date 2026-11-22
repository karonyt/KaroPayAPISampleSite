// KaroPay 公開 Checkout API の小さなクライアント（ブラウザ用・依存なし）
// 仕様は docs.html を参照。

export const DEFAULT_API_BASE = 'https://karopay.karon.jp';

const STORAGE = {
  apiBase: 'sampleShop.apiBase',
  receiveCode: 'sampleShop.receiveCode',
  ttl: 'sampleShop.expiresInMinutes',
  history: 'sampleShop.history'
};

export function cleanApiBase(value) {
  return (String(value || '').trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
}

export function loadSettings() {
  return {
    apiBase: cleanApiBase(read(localStorage, STORAGE.apiBase)),
    receiveCode: read(localStorage, STORAGE.receiveCode) || '',
    expiresInMinutes: Number(read(localStorage, STORAGE.ttl)) || 30
  };
}

export function saveSettings({ apiBase, receiveCode, expiresInMinutes }) {
  write(localStorage, STORAGE.apiBase, cleanApiBase(apiBase));
  write(localStorage, STORAGE.receiveCode, String(receiveCode || '').trim());
  write(localStorage, STORAGE.ttl, String(clampTtl(expiresInMinutes)));
}

export function clampTtl(value) {
  const minutes = Math.trunc(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return 30;
  return Math.min(minutes, 1440);
}

/**
 * POST /api/checkout/public/sessions
 * サイト用コードで Checkout セッションを作る。APIキー不要・CORS 許可済み。
 */
export async function createPublicCheckout(apiBase, body) {
  return request(`${cleanApiBase(apiBase)}/api/checkout/public/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/**
 * GET /api/checkout/public/sessions/:id
 * セッションの状態を読む。期限切れはこの時点で expired に変わる。
 */
export async function getPublicCheckout(apiBase, sessionId) {
  return request(`${cleanApiBase(apiBase)}/api/checkout/public/sessions/${encodeURIComponent(sessionId)}`);
}

async function request(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new KaroPayError('NETWORK_ERROR', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new KaroPayError(data.error || 'REQUEST_FAILED', response.status, response.headers.get('Retry-After'));
  }
  return data;
}

export class KaroPayError extends Error {
  constructor(code, status, retryAfter) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter ? Number(retryAfter) : null;
  }
}

const ERROR_TEXT = {
  CODE_REQUIRED: 'サイト用コードを入力してください',
  CODE_NOT_FOUND: 'サイト用コードが無効です（再発行した場合は新しいコードを入れてください）',
  INVALID_AMOUNT: '金額が無効です（1 以上の整数）',
  INVALID_SUBSCRIPTION: 'サブスクの周期が無効です（day / week / month、回数は 1〜12）',
  INVALID_REQUEST: 'URL か clientReferenceId の形式が無効です',
  CHECKOUT_SESSION_NOT_FOUND: '取引が見つかりません',
  RATE_LIMITED: '短時間に送りすぎました。少し待ってからもう一度試してください',
  NETWORK_ERROR: 'KaroPay に接続できませんでした',
  INTERNAL_ERROR: 'KaroPay 側でエラーが起きました'
};

export function errorMessage(error) {
  const code = error?.code || error?.message || String(error);
  const text = ERROR_TEXT[code] || `支払いページを作成できませんでした（${code}）`;
  if (code === 'RATE_LIMITED' && error?.retryAfter) return `${text}（あと ${error.retryAfter} 秒）`;
  return text;
}

export const STATUS_TEXT = {
  open: '支払い待ち',
  paying: '処理中',
  paid: '支払い済み',
  expired: '期限切れ',
  canceled: '取り消し'
};

const INTERVAL_TEXT = { day: '日', week: '週', month: 'か月' };

export function intervalLabel(interval, count = 1) {
  const unit = INTERVAL_TEXT[interval] || interval;
  if (interval === 'week') return count === 1 ? '毎週' : `${count}週ごと`;
  if (interval === 'day') return count === 1 ? '毎日' : `${count}日ごと`;
  return count === 1 ? '毎月' : `${count}${unit}ごと`;
}

export function money(amount) {
  return `$${Number(amount || 0).toLocaleString('en-US')}`;
}

export function dateText(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ja-JP');
}

// 作った Checkout をこのブラウザに記録する（デモ用。本番は自分のサーバーの DB に持つ）
export function rememberCheckout(entry) {
  const list = loadHistory().filter(item => item.id !== entry.id);
  list.unshift(entry);
  write(localStorage, STORAGE.history, JSON.stringify(list.slice(0, 20)));
}

export function updateHistory(id, patch) {
  const list = loadHistory().map(item => (item.id === id ? { ...item, ...patch } : item));
  write(localStorage, STORAGE.history, JSON.stringify(list));
}

export function loadHistory() {
  try {
    const list = JSON.parse(read(localStorage, STORAGE.history) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  write(localStorage, STORAGE.history, '[]');
}

export function findHistory(id) {
  return loadHistory().find(item => item.id === id) || null;
}

// clientReferenceId は英数字と . _ : - だけ、120 文字まで
export function newReferenceId(prefix) {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}:${Date.now().toString(36)}.${random[0].toString(36)}${random[1].toString(36)}`.slice(0, 120);
}

function read(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // プライベートモードなどでは保存できない。動作は続ける。
  }
}
