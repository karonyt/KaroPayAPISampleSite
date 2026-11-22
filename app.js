import {
  DEFAULT_API_BASE,
  STATUS_TEXT,
  clampTtl,
  clearHistory,
  createPublicCheckout,
  dateText,
  errorMessage,
  getPublicCheckout,
  intervalLabel,
  loadHistory,
  loadSettings,
  money,
  newReferenceId,
  rememberCheckout,
  saveSettings,
  updateHistory
} from './karopay.js';

// 単品（mode: payment）
const products = [
  {
    id: 'vip-rank',
    kind: 'rank',
    name: 'VIP Rank',
    category: 'Rank',
    amount: 500,
    description: 'チャット装飾とショップ特典が付くサンプルランクです。'
  },
  {
    id: 'gem-pack',
    kind: 'gems',
    name: 'Gem Pack 1200',
    category: 'Currency',
    amount: 1200,
    description: 'イベント交換や装飾購入に使うサンプルジェムパックです。'
  },
  {
    id: 'builder-kit',
    kind: 'builder',
    name: 'Builder Kit',
    category: 'Kit',
    amount: 850,
    description: '建築素材と便利アイテムをまとめたサンプルキットです。'
  }
];

// サブスク（mode: subscription）。interval は day / week / month、intervalCount は 1〜12
const plans = [
  {
    id: 'vip-monthly',
    kind: 'rank',
    name: 'VIP Pass',
    category: 'Monthly',
    amount: 300,
    interval: 'month',
    intervalCount: 1,
    description: 'VIP 特典を毎月更新するサンプルプランです。'
  },
  {
    id: 'gem-weekly',
    kind: 'gems',
    name: 'Weekly Gems',
    category: 'Weekly',
    amount: 100,
    interval: 'week',
    intervalCount: 1,
    description: '毎週ジェムを受け取れるサンプルプランです。'
  },
  {
    id: 'builder-season',
    kind: 'builder',
    name: 'Builder Season',
    category: 'Every 3 months',
    amount: 2000,
    interval: 'month',
    intervalCount: 3,
    description: '3 か月ごとに建築キットが届くサンプルプランです。'
  }
];

const apiBaseInput = document.getElementById('api-base');
const receiveCodeInput = document.getElementById('receive-code');
const ttlInput = document.getElementById('ttl');
const statusOutput = document.getElementById('shop-status');
const template = document.getElementById('product-card-template');

const settings = loadSettings();
apiBaseInput.value = settings.apiBase;
apiBaseInput.placeholder = DEFAULT_API_BASE;
receiveCodeInput.value = settings.receiveCode;
ttlInput.value = settings.expiresInMinutes;

document.getElementById('shop-config').addEventListener('submit', event => {
  event.preventDefault();
  persist();
  updateStatus('保存しました', 'ready');
});

for (const product of products) {
  document.getElementById('product-grid').appendChild(renderCard(product, false));
}
for (const plan of plans) {
  document.getElementById('plan-grid').appendChild(renderCard(plan, true));
}

document.getElementById('link-form').addEventListener('submit', openPaymentLink);
document.getElementById('refresh-history').addEventListener('click', refreshHistory);
document.getElementById('clear-history').addEventListener('click', () => {
  clearHistory();
  renderHistory();
});

showReturnNotice();
updateStatus();
renderHistory();

function renderCard(item, subscription) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.product-card');
  const button = node.querySelector('button');

  card.classList.add(item.kind);
  if (subscription) card.classList.add('plan');
  node.querySelector('small').textContent = item.category;
  node.querySelector('h3').textContent = item.name;
  node.querySelector('p').textContent = item.description;
  node.querySelector('.product-buy strong').textContent = subscription
    ? `${money(item.amount)} / ${intervalLabel(item.interval, item.intervalCount)}`
    : money(item.amount);
  button.textContent = subscription ? '加入' : '購入';
  button.dataset.label = button.textContent;
  button.addEventListener('click', () => startCheckout(item, subscription, button));
  return node;
}

function persist() {
  saveSettings({
    apiBase: apiBaseInput.value,
    receiveCode: receiveCodeInput.value,
    expiresInMinutes: ttlInput.value
  });
  ttlInput.value = clampTtl(ttlInput.value);
}

function updateStatus(message, tone = '') {
  statusOutput.className = tone;
  if (message) {
    statusOutput.textContent = message;
    return;
  }
  if (!receiveCodeInput.value.trim()) {
    statusOutput.textContent = 'サイト用コードを入力してください';
    return;
  }
  statusOutput.className = 'ready';
  statusOutput.textContent = 'KaroPay Checkout に接続できます';
}

async function startCheckout(item, subscription, button) {
  const receiveCode = receiveCodeInput.value.trim();
  if (!receiveCode) {
    updateStatus('サイト用コードを入力してください', 'error');
    receiveCodeInput.focus();
    return;
  }

  persist();
  const { apiBase, expiresInMinutes } = loadSettings();
  const clientReferenceId = newReferenceId(item.id);

  // 戻り先はこのページからの相対で作る（GitHub Pages でも手元のサーバーでも動く）
  const successUrl = new URL('./success.html', location.href).toString();
  const cancelUrl = new URL('./index.html', location.href).toString();

  const body = {
    receiveCode,
    amount: item.amount,
    description: subscription ? `${item.name}（${intervalLabel(item.interval, item.intervalCount)}）` : item.name,
    clientReferenceId,
    successUrl,
    cancelUrl,
    expiresInMinutes
  };
  if (subscription) {
    body.mode = 'subscription';
    body.subscription = { interval: item.interval, intervalCount: item.intervalCount };
  }

  button.disabled = true;
  button.textContent = '作成中';
  updateStatus(`${item.name} の支払いページを作成中`, 'ready');

  try {
    const data = await createPublicCheckout(apiBase, body);
    const session = data.checkoutSession;
    rememberCheckout({
      id: session.id,
      apiBase,
      itemId: item.id,
      name: item.name,
      amount: item.amount,
      mode: session.mode,
      interval: item.interval || null,
      intervalCount: item.intervalCount || null,
      clientReferenceId,
      status: session.status,
      url: data.url,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt
    });
    location.href = data.url;
  } catch (error) {
    updateStatus(errorMessage(error), 'error');
    button.disabled = false;
    button.textContent = button.dataset.label;
  }
}

function openPaymentLink(event) {
  event.preventDefault();
  const output = document.getElementById('link-status');
  const raw = document.getElementById('link-input').value.trim();
  const { apiBase } = loadSettings();
  let linkId = raw;

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/pay\/([^/]+)/);
    linkId = match ? decodeURIComponent(match[1]) : '';
  } catch {
    // URL でなければ ID として扱う
  }

  if (!/^klink_[A-Za-z0-9_-]+$/.test(linkId)) {
    output.className = 'inline-status error';
    output.textContent = '決済リンクの URL か、klink_ で始まる ID を入れてください';
    return;
  }

  output.className = 'inline-status ready';
  output.textContent = 'KaroPay の決済リンクを開きます';
  location.href = `${apiBase}/pay/${encodeURIComponent(linkId)}`;
}

function showReturnNotice() {
  const params = new URLSearchParams(location.search);
  const notice = document.getElementById('return-notice');
  if (params.get('status') !== 'canceled') return;

  const sessionId = params.get('checkout_session_id');
  notice.hidden = false;
  notice.textContent = '支払いを取りやめて戻りました。商品はいつでも選び直せます。';
  if (sessionId) refreshOne(sessionId);
  history.replaceState(null, '', location.pathname);
}

function renderHistory() {
  const body = document.getElementById('history-body');
  const list = loadHistory();
  body.replaceChildren();
  document.getElementById('history-empty').hidden = list.length > 0;

  for (const entry of list) {
    const row = document.createElement('tr');
    const kind = entry.mode === 'subscription' ? intervalLabel(entry.interval, entry.intervalCount) : '単品';
    const cells = [entry.name, kind, money(entry.amount), null, dateText(entry.createdAt), null];
    for (const [index, value] of cells.entries()) {
      const cell = document.createElement('td');
      if (index === 3) {
        const badge = document.createElement('span');
        badge.className = `badge ${entry.status}`;
        badge.textContent = STATUS_TEXT[entry.status] || entry.status;
        cell.append(badge);
      } else if (index === 5) {
        const link = document.createElement('a');
        if (entry.status === 'open') {
          link.href = entry.url;
          link.textContent = '支払いへ';
        } else {
          link.href = `./success.html?checkout_session_id=${encodeURIComponent(entry.id)}`;
          link.textContent = '詳細';
        }
        cell.append(link);
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    }
    body.append(row);
  }
}

async function refreshOne(id) {
  const entry = loadHistory().find(item => item.id === id);
  if (!entry) return;
  try {
    const { checkoutSession } = await getPublicCheckout(entry.apiBase, id);
    updateHistory(id, { status: checkoutSession.status });
  } catch {
    // 読めなかったときは前の状態のまま表示する
  }
  renderHistory();
}

async function refreshHistory() {
  const button = document.getElementById('refresh-history');
  button.disabled = true;
  // 1 件ずつ順に読む（レート制限に当たらないように）
  for (const entry of loadHistory()) {
    if (entry.status === 'open' || entry.status === 'paying') await refreshOne(entry.id);
  }
  button.disabled = false;
  renderHistory();
}
