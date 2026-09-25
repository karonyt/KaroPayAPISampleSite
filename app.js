const amountInput = document.getElementById('amount');
const payBtn = document.getElementById('pay-btn');
const statusOutput = document.getElementById('shop-status');

payBtn.addEventListener('click', async () => {
  const amount = parseInt(amountInput.value);
  if (!amount || amount <= 0) {
    statusOutput.textContent = '正しい金額を入力してください';
    statusOutput.className = 'error';
    return;
  }

  payBtn.disabled = true;
  payBtn.textContent = '作成中...';
  statusOutput.textContent = '決済ページを作成中';
  statusOutput.className = 'ready';

  try {
    const response = await fetch('https://karopay.karon.jp/api/checkout/public/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiveCode: 'tH5REVl7f87KASs-k2G36TcI',
        amount: amount,
        description: '活動支援寄付',
        successUrl: `${location.origin}/success.html`,
        cancelUrl: `${location.origin}/index.html`
      })
    });
    const data = await response.json();
    if (data.url) {
      sessionStorage.setItem('sampleShop.lastProduct', JSON.stringify({ name: '活動支援寄付', amount: amount }));
      location.href = data.url;
    } else {
      throw new Error();
    }
  } catch (e) {
    statusOutput.textContent = 'エラーが発生しました';
    statusOutput.className = 'error';
    payBtn.disabled = false;
    payBtn.textContent = '決済に進む';
  }
});
