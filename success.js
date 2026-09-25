const params = new URLSearchParams(location.search);
const sessionId = params.get('checkout_session_id');
const apiBase = (sessionStorage.getItem('sampleShop.apiBase') || localStorage.getItem('sampleShop.apiBase') || 'https://karopay.karon.jp').replace(/\/+$/, '');
const product = readProduct();
const panel = document.getElementById('result-panel');
const message = document.getElementById('result-message');
const details = document.getElementById('result-details');

verifyPayment();

async function verifyPayment() {
  if (!sessionId) {
    showResult('failed', '支払い情報がありません', []);
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/checkout/public/sessions/${encodeURIComponent(sessionId)}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'VERIFY_FAILED');
    }

    const session = data.checkoutSession;
    const expectedAmount = product?.amount;
    const amountMatches = !expectedAmount || Number(session.amount) === Number(expectedAmount);

    if (session.status === 'paid' && amountMatches) {
      showResult('paid', 'Thank you!', [
        ['商品', product?.name || session.description || 'Donation'],
        ['金額', `$${Number(session.amount || 0).toLocaleString('en-US')}`],
        ['取引', session.id]
      ]);
      return;
    }

    showResult('failed', '支払いを確認できません', [
      ['状態', session.status],
      ['金額', `$${Number(session.amount || 0).toLocaleString('en-US')}`],
      ['取引', session.id]
    ]);
  } catch {
    showResult('failed', 'KaroPayへ接続できませんでした', []);
  }
}

function showResult(state, text, rows) {
  panel.classList.remove('paid', 'failed');
  panel.classList.add(state);
  panel.querySelector('p').textContent = state === 'paid' ? 'Complete' : 'Pending';
  panel.querySelector('h1').textContent = state === 'paid' ? '支払い完了' : '確認できません';
  message.textContent = text;
  details.replaceChildren();

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    details.append(row);
  }
}

function readProduct() {
  try {
    return JSON.parse(sessionStorage.getItem('sampleShop.lastProduct') || 'null');
  } catch {
    return null;
  }
}
