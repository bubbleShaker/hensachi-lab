# hensachi-lab MVP 概要

## これは何か
世の中の正規分布データから、入力した値の **偏差値・zスコア・上位%** を
ブラウザ内の DuckDB (DuckDB-WASM) で計算する統計サイト。サーバ不要・静的ホスティングで動く。

## データフロー
```
data/definitions.json (公表 平均/SD)
        │  npm run gen:data (Box-Muller + seed付きPRNG)
        ▼
public/data/samples.csv (29000行の疑似サンプル)
        │  ブラウザで fetch → registerFileText
        ▼
DuckDB-WASM の samples テーブル
        │  SQL集計(avg/stddev_samp/FILTER count)
        ▼
src/stats.ts → 偏差値=50+10z / 上位%(中間順位法) / 正規CDF
        ▼
src/main.ts → メトリクス表示 + Chart.js(正規分布カーブ+自分の位置)
```

## レイヤー（信頼してよい境界）
- `src/db.ts` … DB を用意する責務のみ。中身を知らなくても stats/main は動く。
- `src/stats.ts` … 数値計算のみ。DOM に触れない。
- `src/main.ts` … UI 配線と描画のみ。SQL を知らない。

## カテゴリ（初期）
身長・体重・IQ・握力・50m走（性別別）。追加は definitions.json に1エントリ足して `npm run gen:data` するだけ。

## 使い方
```
npm install
npm run gen:data   # CSV生成(定義を変えたら再実行)
npm run dev        # 開発サーバ
npm run build      # 本番ビルド(dist/)
```

## 注意点 / 既知の割り切り
- 平均/SD は公表統計の **概算**。厳密な原典値ではない（教育・娯楽目的）。
- DuckDB-WASM のエンジン本体は jsDelivr CDN から読む → **初回はネット接続が必要**。
- DuckDB実行時・Chart描画は **ブラウザでの目視確認が未実施**。要動作確認。
- 偏差値は「値が大きいほど高い」素の式。50m走のように小さいほど良い種目は、
  偏差値は低く出るが「上位%」は higherIsBetter を考慮して正しく出す設計。

## 対応 Issue / PR
- #1 データ生成 / #2 フロント / PR #3 でマージ
