/**
 * DuckDB-WASM の初期化と CSV ロードを担うレイヤー。
 * ここは「ブラウザ内で SQL を実行できる DB を用意する」責務だけを持ち、
 * 統計計算(stats.ts)や UI(main.ts)からは詳細を隠す。
 */
import * as duckdb from "@duckdb/duckdb-wasm";

let dbPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function createConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  // DuckDB エンジン本体(wasm/worker)は jsDelivr CDN から取得する定番構成。
  // 実行環境(ブラウザ)に合ったバンドルを selectBundle が自動選択する。
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);

  // Worker は別スレッドで DuckDB を動かすためのもの。CDN の worker スクリプトを
  // importScripts する薄いラッパを Blob URL 経由で起動する。
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);

  const conn = await db.connect();

  // 静的アセットの CSV を取得し、DuckDB に仮想ファイルとして登録 → テーブル化。
  // public/ 配下は BASE_URL 直下に配信される（public/data/samples.csv → {BASE}data/samples.csv）。
  const csvUrl = `${import.meta.env.BASE_URL}data/samples.csv`;
  const csv = await fetch(csvUrl).then((r) => {
    if (!r.ok) throw new Error(`CSV の取得に失敗: ${r.status}`);
    return r.text();
  });
  await db.registerFileText("samples.csv", csv);
  // スキーマを明示して型推論に依存しない（value は必ず DOUBLE として集計）。
  await conn.query(
    `CREATE TABLE samples AS
       SELECT * FROM read_csv('samples.csv', header = true,
         columns = {'category_id': 'VARCHAR', 'value': 'DOUBLE'});`,
  );

  return conn;
}

/** 接続を一度だけ生成して使い回す（多重初期化を防ぐ）。 */
export function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!dbPromise) dbPromise = createConnection();
  return dbPromise;
}
