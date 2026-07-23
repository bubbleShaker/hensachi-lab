/**
 * 公表平均/SD から正規分布に従う疑似サンプルを生成し CSV に書き出す。
 *
 * - 乱数は seed 付き PRNG (mulberry32) で再現可能にする（実行毎に結果が変わらない）。
 * - 正規乱数は Box-Muller 変換で作る（一様乱数2つ → 正規乱数）。
 * - 出力は public/data/samples.csv（列: category_id, value）。メタ情報は definitions.json 側で持つ。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

interface Category {
  id: string;
  mean: number;
  sd: number;
  n: number;
}
interface Definitions {
  seed: number;
  categories: Category[];
}

// mulberry32: 32bit の軽量シード付き PRNG。seed から決定論的に [0,1) を返す。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: 標準正規乱数 N(0,1) を1つ返す。
function normal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng(); // log(0) を避ける
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const defs: Definitions = JSON.parse(
  readFileSync(resolve(root, "data/definitions.json"), "utf-8"),
);

const rng = mulberry32(defs.seed);
const lines: string[] = ["category_id,value"];
let clipped = 0;

for (const cat of defs.categories) {
  for (let i = 0; i < cat.n; i++) {
    const raw = cat.mean + cat.sd * normal(rng);
    // 小数第2位まで。物理量として非現実的な負値は 0 でクリップ。
    // クリップは分布を歪める（DuckDB再集計の mean/sd が公表値から僅かにずれる要因）ため件数を記録。
    if (raw < 0) clipped++;
    const value = Math.max(0, Math.round(raw * 100) / 100);
    lines.push(`${cat.id},${value}`);
  }
}
if (clipped > 0) {
  console.warn(`⚠️ 負値クリップが ${clipped} 件発生（分布が僅かに歪むのだ）。`);
}

const outPath = resolve(root, "public/data/samples.csv");
writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");

const total = lines.length - 1;
console.log(`✅ ${total} 行を生成: ${outPath}`);
