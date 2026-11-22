// 例ページ共通: 接続設定バー・Checkout の作成・戻ってきたときの確認
import {
  DEFAULT_API_BASE,
  createPublicCheckout,
  errorMessage,
  findHistory,
  getPublicCheckout,
  loadSettings,
  newReferenceId,
  rememberCheckout,
  saveSettings,
  updateHistory
} from '../karopay.js';

export * from '../karopay.js';

/** 接続設定（KaroPay URL・サイト用コード）のバーを #settings に作る。ショップと同じ設定を使う。 */
export function mountSettings() {
  const host = document.getElementById('settings');
  if (!host) return;
  const settings = loadSettings();
  host.className = 'panel-section';
  host.innerHTML = `
    <form class="settings-bar">
      <label class="field"><span>KaroPay URL</span><input name="apiBase" autocomplete="off" inputmode="url" /></label>
      <label class="field"><span>サイト用コード</span><input name="receiveCode" autocomplete="off" placeholder="KaroPay の「受け取り」画面でコピー" /></label>
      <button class="solid-button dark" type="submit">保存</button>
    </form>
    <output class="inline-status" data-role="settings-status"></output>`;
  const form = host.querySelector('form');
  const status = host.querySelector('[data-role="settings-status"]');
  form.apiBase.value = settings.apiBase;
  form.apiBase.placeholder = DEFAULT_API_BASE;
  form.receiveCode.value = settings.receiveCode;
  const show = () => {
    const ready = Boolean(form.receiveCode.value.trim());
    status.className = `inline-status ${ready ? 'ready' : ''}`;
    status.textContent = ready ? 'この設定で KaroPay に接続します（売上はコードの持ち主の口座へ）' : 'サイト用コードを入れて保存してください';
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    saveSettings({ ...loadSettings(), apiBase: form.apiBase.value, receiveCode: form.receiveCode.value });
    show();
  });
  show();
}

/**
 * Checkout を作る。redirect: true なら KaroPay の支払いページへ移る。
 * returnTo: 'self'（このページに戻る）か 'success'（共通の結果ページ）
 */
export async function startCheckout({
  amount,
  description,
  name = description,
  refPrefix = 'order',
  mode = 'payment',
  subscription = null,
  expiresInMinutes,
  returnTo = 'success',
  redirect = true,
  receiveCode,
  meta = {}
}) {
  const settings = loadSettings();
  if (receiveCode) settings.receiveCode = receiveCode; // 請求書など、ほかの人のコードで作るとき
  if (!settings.receiveCode) throw Object.assign(new Error('CODE_REQUIRED'), { code: 'CODE_REQUIRED' });

  const clientReferenceId = newReferenceId(refPrefix);
  const here = new URL(location.href);
  here.search = '';
  here.hash = '';
  const successUrl = returnTo === 'self' ? here.toString() : new URL('../success.html', location.href).toString();

  const body = {
    receiveCode: settings.receiveCode,
    amount,
    description: String(description || '').slice(0, 160),
    clientReferenceId,
    successUrl,
    cancelUrl: here.toString(),
    expiresInMinutes: expiresInMinutes || settings.expiresInMinutes
  };
  if (mode === 'subscription') {
    body.mode = 'subscription';
    body.subscription = subscription;
  }

  const data = await createPublicCheckout(settings.apiBase, body);
  const session = data.checkoutSession;
  rememberCheckout({
    id: session.id,
    apiBase: settings.apiBase,
    name,
    amount,
    mode: session.mode,
    interval: subscription?.interval || null,
    intervalCount: subscription?.intervalCount || null,
    clientReferenceId,
    status: session.status,
    url: data.url,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    page: location.pathname.split('/').pop(),
    meta
  });
  if (redirect) location.href = data.url;
  return { session, url: data.url, clientReferenceId };
}

/**
 * KaroPay から戻ってきたときの確認。
 * 戻ってきていなければ null。戻ってきていれば KaroPay に問い合わせ、
 * このブラウザで作った注文（金額・注文番号）と一致するかを返す。
 */
export async function readReturn() {
  const params = new URLSearchParams(location.search);
  const id = params.get('checkout_session_id');
  if (!id) return null;
  const returnedStatus = params.get('status');
  history.replaceState(null, '', location.pathname);

  const entry = findHistory(id);
  if (returnedStatus === 'canceled') return { canceled: true, entry, session: null, verified: false };

  const { checkoutSession: session } = await getPublicCheckout(entry?.apiBase || loadSettings().apiBase, id);
  if (entry) updateHistory(id, { status: session.status });
  const verified = Boolean(
    entry &&
    session.status === 'paid' &&
    Number(session.amount) === Number(entry.amount) &&
    session.clientReferenceId === entry.clientReferenceId
  );
  return { canceled: false, entry, session, verified };
}

/** 一定間隔で状態を読み、open/paying 以外になったら止める。止める関数を返す。 */
export function watchCheckout(sessionId, onUpdate, intervalMs = 3000) {
  let stopped = false;
  let timer;
  const apiBase = findHistory(sessionId)?.apiBase || loadSettings().apiBase;
  const tick = async () => {
    if (stopped) return;
    try {
      const { checkoutSession } = await getPublicCheckout(apiBase, sessionId);
      updateHistory(sessionId, { status: checkoutSession.status });
      onUpdate(checkoutSession);
      if (checkoutSession.status !== 'open' && checkoutSession.status !== 'paying') return;
    } catch (error) {
      onUpdate(null, error);
    }
    timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** ボタンを押したら Checkout を作る、の定型。失敗はステータス欄に出す。 */
export function bindCheckoutButton(button, statusEl, buildOptions) {
  button.addEventListener('click', async () => {
    const label = button.textContent;
    let options;
    try {
      options = buildOptions();
    } catch (error) {
      setStatus(statusEl, error.message, 'error');
      return;
    }
    if (!options) return;
    button.disabled = true;
    button.textContent = '作成中…';
    setStatus(statusEl, 'KaroPay の支払いページを作っています', 'ready');
    try {
      await startCheckout(options);
    } catch (error) {
      setStatus(statusEl, errorMessage(error), 'error');
      button.disabled = false;
      button.textContent = label;
    }
  });
}

export function setStatus(el, text, tone = '') {
  if (!el) return;
  el.className = `inline-status ${tone}`;
  el.textContent = text;
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}
