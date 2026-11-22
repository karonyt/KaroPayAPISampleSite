# KaroPayAPISampleSite

KaroPay（KaroEarth のゲーム内ドル決済）の Checkout API を使うサンプルサイトです。

- サイト: https://karonyt.github.io/KaroPayAPISampleSite/
- API ドキュメント: https://karonyt.github.io/KaroPayAPISampleSite/docs.html
- 使い方の例（10 個）: https://karonyt.github.io/KaroPayAPISampleSite/examples/

## 中身

| ファイル | 内容 |
|---|---|
| `index.html` / `app.js` | サンプルショップ。単品購入・サブスク・決済リンク・取引の状態確認 |
| `success.html` / `success.js` | 支払い後の戻り先。KaroPay に問い合わせ、金額と注文番号を照らして結果を出す |
| `docs.html` | API ドキュメント |
| `karopay.js` | ブラウザ用の小さな API クライアント（依存なし） |
| `examples/` | 使い方の例 10 ページ（投げ銭・月額サポーター・カート・チケット・請求書・賃料・レジ QR・割り勘・決済リンク・サーバー連携） |
| `server-example/server.mjs` | APIキー版をサーバーから使う例（Node.js 18 以上・依存なし） |

## 試し方

1. KaroPay（https://karopay.karon.jp/receive）にログインし、「受け取り」画面の「サイト用コード」をコピーする。
2. サイトの「接続設定」に貼って保存する。
3. 商品を選ぶと KaroPay の支払いページへ移る。

**本物の KaroPay 口座のお金が動きます。** 自分のコードで、自分の別アカウントから払うなどして試してください。

手元で動かすときは、静的ファイルとして配信するだけです。

```sh
python3 -m http.server 8000
# http://localhost:8000/index.html
```

サーバー例:

```sh
KAROPAY_API_KEY=... node server-example/server.mjs
# http://localhost:8787/
```

APIキーは KaroEarth の運営が発行します。キーはリポジトリに入れないでください。

## 大事なこと

商品を渡す前に、必ず KaroPay に問い合わせて `status === "paid"`・金額・`clientReferenceId` を確かめてください。戻り先 URL の `status=paid` は誰でも書けます。詳しくは docs.html の「支払いの確かめ方」。
