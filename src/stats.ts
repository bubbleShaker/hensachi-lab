/**
 * 統計計算レイヤー。DuckDB から母集団の平均・標準偏差・実測順位を取り出し、
 * 偏差値・z スコア・パーセンタイルを組み立てる。
 */
import { getConnection } from "./db";

export interface StatResult {
  mean: number;
  sd: number;
  n: number;
  z: number;
  /** 偏差値 = 50 + 10z（値が大きいほど高い） */
  hensachi: number;
  /** 正規分布 CDF に基づく「この値以下」の割合(0-1) */
  cdf: number;
  /** 「良い方から数えて上位何%か」(0-100)。higherIsBetter を考慮した実測値。 */
  topPercent: number;
  /** 100人中あなたは良い方から何番目か(1-100) */
  rankIn100: number;
}

// erf の数値近似(Abramowitz & Stegun 7.1.26)。最大誤差 ~1.5e-7。
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** 標準正規分布の累積分布関数 Φ(z)。 */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * カテゴリ category の母集団に対する値 x の各種統計を計算する。
 * mean/sd は DuckDB の avg()/stddev_samp() で母集団(疑似サンプル)から算出。
 * 上位%は実測（value を数える）で求め、正規分布の仮定に依存しない。
 */
export async function computeStats(
  category: string,
  x: number,
  higherIsBetter: boolean,
): Promise<StatResult> {
  const conn = await getConnection();
  const stmt = await conn.prepare(
    `SELECT
        avg(value)          AS mean,
        stddev_samp(value)  AS sd,
        count(*)            AS n,
        count(*) FILTER (WHERE value > ?) AS gt,
        count(*) FILTER (WHERE value < ?) AS lt,
        count(*) FILTER (WHERE value = ?) AS eq
      FROM samples WHERE category_id = ?;`,
  );
  const res = await stmt.query(x, x, x, category);
  const row = res.get(0);
  if (!row) throw new Error(`カテゴリが見つからない: ${category}`);

  const mean = Number(row.mean);
  const sd = Number(row.sd);
  const n = Number(row.n);
  const gt = Number(row.gt); // x より大きい件数
  const lt = Number(row.lt); // x より小さい件数
  const eq = Number(row.eq); // x と同値の件数
  if (!(sd > 0) || n < 2) {
    throw new Error("標準偏差が計算できないのだ（サンプルが不足）。");
  }

  const z = (x - mean) / sd;
  const hensachi = 50 + 10 * z;

  // 上位%は「厳密に良い側の件数 + 同値の半分」を母数で割る中間順位法。
  // 丸めで同値が多発しても偏らず、le+ge が n を超える問題を避ける。
  const strictlyBetter = higherIsBetter ? gt : lt;
  const topPercent = ((strictlyBetter + eq / 2) / n) * 100;
  const rankIn100 = Math.min(100, Math.max(1, Math.round(topPercent)));

  return { mean, sd, n, z, hensachi, cdf: normalCdf(z), topPercent, rankIn100 };
}
