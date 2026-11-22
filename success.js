import {
  STATUS_TEXT,
  dateText,
  errorMessage,
  findHistory,
  getPublicCheckout,
  intervalLabel,
  loadSettings,
  money,
  updateHistory
} from './karopay.js';

// KaroPay は successUrl に次のクエリを付けて戻す:
//   checkout_session_id, status, client_reference_id（指定したとき）, subscription_id（サブスクのとき）
const params = new URLSearchParams(location.search);
const sessionId = params.get('checkout_session_id');
const returnedReference = params.get('client_reference_id');
const entry = sessionId ? findHistory(sessionId) : null;
const apiBase = entry?.apiBase || loadSettings().apiBase;

const panel = document.getElementById('result-panel');
const message = document.getElementById('result-message');
const details = document.getElementById('result-details');
const recheck = document.getElementById('recheck');
const payAgain = document.getElementById('pay-again');

recheck.addEventListener('click', () => verify(0));
verify(0);

// 「処理中」は少し待つと「支払い済み」に変わることがあるので、数回だけ読み直す
async function verify(attempt) {
  if (!sessionId) {
    show('failed', '確認できません', '支払い情報がありません', []);
    return;
  }

  recheck.hidden = true;
  let session;
  try {
    ({ checkoutSession: session } = await getPublicCheckout(apiBase, sessionId));
  } catch (error) {
    show('failed', '確認できません', errorMessage(error), [['取引', sessionId]]);
    recheck.hidden = false;
    return;
  }

  if (entry) updateHistory(session.id, { status: session.status });

  // 自分が作った取引と一致するか（金額・参照 ID）を確かめる
  const problems = [];
  if (entry && Number(session.amount) !== Number(entry.amount)) problems.push('金額が注文と一致しません');
  if (entry && session.clientReferenceId !== entry.clientReferenceId) problems.push('注文番号が一致しません');
  if (returnedReference && session.clientReferenceId && returnedReference !== session.clientReferenceId) {
    problems.push('戻り先の注文番号が取引と一致しません');
  }

  const isSubscription = session.mode === 'subscription';
  const rows = [
    ['商品', entry?.name || session.description || '—'],
    ['金額', isSubscription
      ? `${money(session.amount)} / ${intervalLabel(session.subscription?.interval, session.subscription?.intervalCount)}`
      : money(session.amount)],
    ['状態', STATUS_TEXT[session.status] || session.status],
    ['受取人', session.merchant?.name || '—'],
    ['取引', session.id]
  ];
  if (session.clientReferenceId) rows.push(['注文番号', session.clientReferenceId]);
  if (session.payerName) rows.push(['支払った人', session.payerName]);
  if (session.paidAt) rows.push(['支払い日時', dateText(session.paidAt)]);
  if (isSubscription && session.subscription?.id) rows.push(['契約', session.subscription.id]);
  if (session.status === 'open') rows.push(['期限', dateText(session.expiresAt)]);

  if (problems.length) {
    show('failed', '確認できません', problems.join(' / '), rows);
    return;
  }

  switch (session.status) {
    case 'paid':
      show('paid', isSubscription ? '加入完了' : '支払い完了',
        isSubscription ? 'ご加入ありがとうございます。次回から自動で請求されます。' : '購入ありがとうございます', rows);
      return;
    case 'paying':
      show('pending', '処理中', 'KaroPay で支払いを処理しています', rows);
      if (attempt < 5) setTimeout(() => verify(attempt + 1), 2000);
      else recheck.hidden = false;
      return;
    case 'open':
      show('pending', 'まだ支払われていません', '期限までは支払いページから続けられます', rows);
      payAgain.href = session.checkoutUrl;
      payAgain.hidden = false;
      recheck.hidden = false;
      return;
    case 'expired':
      show('failed', '期限切れ', '支払い期限を過ぎました。もう一度商品を選んでください', rows);
      return;
    case 'canceled':
      show('failed', '取り消し', 'この取引は取り消されました', rows);
      return;
    default:
      show('failed', '確認できません', `不明な状態です（${session.status}）`, rows);
  }
}

function show(state, title, text, rows) {
  panel.classList.remove('paid', 'failed', 'pending');
  panel.classList.add(state);
  panel.querySelector('p').textContent = state === 'paid' ? 'Complete' : state === 'pending' ? 'Pending' : 'Not paid';
  panel.querySelector('h1').textContent = title;
  message.textContent = text;
  details.replaceChildren();
  payAgain.hidden = true;

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    description.title = value;
    row.append(term, description);
    details.append(row);
  }
}
