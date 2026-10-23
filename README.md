# GoodBad記録（メンバー評価ポイント管理システム）

マネージャーが、メンバーの日々の Good／Bad を気づいたときにすぐ記録するためのWebシステムです。
記録は半期目標に沿って振り返ることができ、月次・半期レポートはAIが自動で要約します。
PC・スマホのどちらからでも、ブラウザで URL を開くだけで使えます。

---

## 1. できること

| 画面 | 内容 |
|---|---|
| 登録 | メンバー選択 → Good/Bad → 内容 → 登録。いつでも何回でも登録できる。過去日付や関連目標も指定可 |
| 記録 | メンバーごとに **日別／月別／半期別** で一覧。Good/Bad・目標で絞り込み、編集・削除 |
| 目標 | メンバー×半期ごとに目標を複数登録。前の半期からコピー可 |
| レポート | 月次／半期の AI 要約を作成・閲覧・コピー。全員分の一括作成も可 |
| 設定 | メンバーの追加・名前変更・並べ替え・非表示、ログアウト |

半期は **上期＝4〜9月、下期＝10〜翌3月**（日本時間）です。
変更する場合は `src/period.js` を直してください。画面とAPIサーバーの両方がこのファイルを使っています。

## 2. 仕組み（全体像）

```
 PC / スマホのブラウザ
        │
        ▼
 ┌─────────────── Render ────────────────┐
 │ goodbad-web（画面・Static Site）       │ ← スリープしない
 │ goodbad-api（AI要約・Express）         │ ← 無料プランは15分無操作でスリープ
 └───────┬───────────────────┬───────────┘
         │ 記録の読み書き     │ 要約依頼
         ▼                   ▼
 Supabase（DB・ログイン）   Claude API
 ※本人のデータしか見えない   ※APIキーは goodbad-api だけに置く
```

画面とAPIを分けた理由は次の2点です。
- 記録の登録・閲覧は、画面から Supabase へ直接行います。そのため、APIサーバーがスリープしていても**登録は待ち時間なし**で使えます。
- AI要約（たまにしか使わない機能）だけがAPIサーバーを使います。スリープ中なら、初回は起動に30〜60秒かかります。待ち時間を減らすため、レポート画面を開いた時点でAPIサーバーを自動で起こしています。

用語：
- **Static Site**：HTMLなどのファイルを配信するだけのサービス。無料で、スリープしません
- **RLS（行レベルセキュリティ）**：「ログインした本人が登録したデータだけ」を読み書きできるようにするDBの仕組み

## 3. 導入手順（初回のみ・約30〜60分）

### 事前に用意するもの
- Supabase アカウント（https://supabase.com）
- Render アカウント（https://render.com）
- GitHub アカウント（Render への公開に使用）
- Claude API キー（https://console.anthropic.com で発行。従量課金）

### 手順1：Supabase（DB・ログイン）
1. Supabase で New project を作成します。**Region は Tokyo（Northeast Asia）** を選んでください
2. 左メニュー **SQL Editor** を開き、`supabase/schema.sql` の中身を全部貼り付けて **Run** します
3. **Authentication → Sign In / Providers → Email** で「Allow new users to sign up」を **オフ** にします。
   第三者が勝手にアカウントを作れないようにするためです
4. **Authentication → Users → Add user** で、自分のメールアドレスとパスワードを登録します
5. **Project Settings → API** で、次の2つを控えておきます
   - Project URL
   - anon public キー

### 手順2：GitHub にアップロード
このフォルダを、GitHub の **非公開（Private）リポジトリ** にアップロードします。

### 手順3：Render で2つのサービスを作成
1. Render ダッシュボードで **New → Blueprint** を選び、手順2のリポジトリを選択します
   （`render.yaml` が読み込まれ、`goodbad-api` と `goodbad-web` が一括作成されます）
2. 環境変数の入力を求められたら、次のように入力します。

| サービス | 変数 | 入れる値 |
|---|---|---|
| goodbad-api | `SUPABASE_URL` | 手順1-5 の Project URL |
| goodbad-api | `SUPABASE_ANON_KEY` | 手順1-5 の anon public キー |
| goodbad-api | `ANTHROPIC_API_KEY` | Claude API キー |
| goodbad-api | `ALLOWED_ORIGIN` | ひとまず `https://example.com`（後で直す） |
| goodbad-web | `VITE_SUPABASE_URL` | 手順1-5 の Project URL |
| goodbad-web | `VITE_SUPABASE_ANON_KEY` | 手順1-5 の anon public キー |
| goodbad-web | `VITE_API_URL` | ひとまず `https://example.com`（後で直す） |

3. 作成が終わると、それぞれのサービスに URL が発行されます（例：`https://goodbad-web-xxxx.onrender.com`）
4. **URLの相互設定**（初回のみ）
   - goodbad-api → Environment → `ALLOWED_ORIGIN` を **goodbad-web の URL** に変更し、保存します
   - goodbad-web → Environment → `VITE_API_URL` を **goodbad-api の URL** に変更し、保存します。
     その後 **Manual Deploy → Clear build cache & deploy** を実行します。
     画面側の設定はビルド時に埋め込まれるため、変更のたびに再デプロイが必要です
5. goodbad-web の URL を開いてログインし、レポート画面で1件作成できれば完了です

URL はどちらも末尾の `/` なしで入力してください。

### 手順4：スマホに登録（任意）
- iPhone（Safari）：共有ボタン → **ホーム画面に追加**
- Android（Chrome）：メニュー → **ホーム画面に追加**

## 4. ローカルで試す（開発者向け）
```bash
# APIサーバー
cd server && cp .env.example .env   # 値を書き換える
npm install && npm run dev          # http://localhost:3001

# 画面（別のターミナルで、フォルダ直下にて）
cp .env.example .env                # 値を書き換える
npm install && npm run dev          # http://localhost:5173
npm test                            # 期間計算のテスト
```

## 5. エラー時の挙動

| 状況 | 挙動 |
|---|---|
| 通信エラーで登録失敗 | エラーを表示します。**入力内容は消えない**ので、再度「登録」を押せば大丈夫です |
| 期間内に記録が0件 | レポートは作成せず「記録がない」と表示します |
| APIサーバーがスリープ中 | 最大3分待ちます。超えた場合は「1分ほど待って再実行」を案内します |
| AIの応答が遅い（90秒超） | 中断して再実行を案内します。DBは変更しません |
| AIの利用上限・障害 | エラー番号と原因の目安を表示します。既存レポートはそのまま残ります |
| 全員分作成で一部失敗 | 成功した人の分は保存します。失敗した人の名前と理由を一覧で表示します |
| 許可していないURLからAPIを呼ぶ | 拒否します（`ALLOWED_ORIGIN` で制御） |
| 環境変数の設定漏れ | APIは起動時に Render の Logs へ警告を出します。レポート作成時も画面に表示します |

## 6. 運用上の注意
- **人事評価に関わる情報です。**
  社外クラウド（Supabase / Render）への保存や、Claude API へのデータ送信について、事前に社内の情報セキュリティ規程と上長の承認を確認してください。
- AIレポートは下書きです。評価に使う前に、必ず元の記録と照らして確認してください。
- 記録は「事実（いつ・何を）」で書くと、AIの要約精度も公平性も上がります。
- 異動・退職者は削除せず「非表示」にしてください。削除すると、記録とレポートもすべて消えます。
- Supabase 無料プランは、**7日間アクセスがないと一時停止**することがあります（ダッシュボードから再開できます）。
  バックアップのため、定期的に Table Editor から CSV エクスポートしておくと安心です。
- レポート作成の待ち時間をなくしたい場合は、goodbad-api を Render の有料プラン（Starter）にするとスリープしなくなります。

## 7. ファイル構成
```
render.yaml                  Render の構成定義（2サービス一括作成）
supabase/schema.sql          DB定義（テーブル・アクセス制御）
server/index.js              AI要約APIサーバー（Express）
src/App.jsx                  画面全体の枠・タブ切替
src/pages/                   各画面（登録・記録・目標・レポート・設定）
src/period.js                期間（日/月/半期）の計算 ※画面・API共通
src/styles.css               デザイン（色は先頭の変数で一括変更）
tests/period.test.js         期間計算のテスト
```

## 8. 今後の拡張候補
- 複数マネージャー対応（担当メンバー単位の権限）
- 月初に前月レポートを自動作成（Render の Cron Job）
- レポートの Word / PDF 出力
