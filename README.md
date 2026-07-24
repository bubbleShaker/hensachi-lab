# 偏差値ラボ (hensachi-lab)

世の中の正規分布データから、入力した値の **偏差値・zスコア・上位%** を
**ブラウザ内の DuckDB (DuckDB-WASM)** で計算する統計サイトなのだ。サーバ不要・完全静的。

🔗 **公開URL: https://bubbleshaker.github.io/hensachi-lab/**

## できること
- カテゴリ（身長・体重・IQ・握力・50m走）を選び、自分の値を入れると
  - **偏差値** = 50 + 10 × z
  - **z スコア** = (値 − 平均) / 標準偏差
  - **上位%**（実測・中間順位法。種目の良し悪し=higherIsBetter を考慮）
  - 「100人ならあなたは何位」
- Chart.js で正規分布カーブ＋自分の位置を可視化

## しくみ
```
data/definitions.json (公表 平均/SD)
   │ npm run gen:data  (Box-Muller + seed付きPRNG)
   ▼
public/data/samples.csv (29000行の疑似サンプル)
   │ ブラウザで fetch → registerFileText
   ▼
DuckDB-WASM が SQL集計 (avg / stddev_samp / FILTER)
   ▼
偏差値・上位% を算出し Chart.js で描画
```

レイヤー分離: `src/db.ts`(DB用意) / `src/stats.ts`(統計計算) / `src/main.ts`(UI)。

## 開発
```bash
npm install
npm run gen:data   # 定義を変えたら再生成
npm run dev        # 開発サーバ
npm run build      # 本番ビルド (dist/)
```
master へマージすると GitHub Actions が自動で Pages に公開する（`.github/workflows/deploy.yml`）。

## 注意
- 平均/標準偏差は公表統計に基づく **概算**（教育・娯楽目的の近似）。
- DuckDB-WASM のエンジンは jsDelivr CDN から読み込むため、初回はネット接続が必要。

詳しくは [`summary/mvp.md`](summary/mvp.md) と [`knowledge/duckdb-wasm-and-stats.md`](knowledge/duckdb-wasm-and-stats.md) を見るのだ。
