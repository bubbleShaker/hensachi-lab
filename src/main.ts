/**
 * エントリポイント。UI 配線と描画のみを担い、DB/統計の詳細は db.ts / stats.ts に委ねる。
 */
import "./style.css";
import { Chart } from "chart.js/auto";
import defsRaw from "../data/definitions.json";
import { computeStats, type StatResult } from "./stats";

interface Category {
  id: string;
  label: string;
  group: string;
  unit: string;
  mean: number;
  sd: number;
  higherIsBetter: boolean;
  n: number;
  source: string;
}
const defs = defsRaw as { note: string; categories: Category[] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const categorySel = $<HTMLSelectElement>("category");
const valueInput = $<HTMLInputElement>("value");
const unitSpan = $<HTMLSpanElement>("unit");
const calcBtn = $<HTMLButtonElement>("calc");
const statusEl = $<HTMLParagraphElement>("status");
const resultsEl = $<HTMLElement>("results");
let chart: Chart | null = null;

// カテゴリのプルダウンを定義から生成。value は id を直接使い、DBクエリと結合させる。
for (const c of defs.categories) {
  const opt = document.createElement("option");
  opt.value = c.id;
  opt.textContent = `${c.label}（${c.group}）`;
  categorySel.appendChild(opt);
}
$("disclaimer").textContent = defs.note;

function currentCategory(): Category {
  const c = defs.categories.find((c) => c.id === categorySel.value);
  if (!c) throw new Error("カテゴリ未選択なのだ。");
  return c;
}
function syncUnit() {
  unitSpan.textContent = currentCategory().unit;
}
categorySel.addEventListener("change", syncUnit);
syncUnit();

async function run() {
  const cat = currentCategory();
  const x = Number(valueInput.value);
  if (!valueInput.value || Number.isNaN(x)) {
    statusEl.textContent = "値を入力してほしいのだ。";
    return;
  }
  statusEl.textContent = "計算中なのだ…";
  calcBtn.disabled = true; // 計算中の連打で多重クエリが走るのを防ぐ。
  try {
    const s = await computeStats(cat.id, x, cat.higherIsBetter);
    statusEl.textContent = "";
    render(cat, x, s);
  } catch (err) {
    statusEl.textContent = `計算に失敗したのだ: ${(err as Error).message}`;
  } finally {
    calcBtn.disabled = false;
  }
}

function render(cat: Category, x: number, s: StatResult) {
  resultsEl.classList.remove("hidden");
  $("m-hensachi").textContent = s.hensachi.toFixed(1);
  $("m-z").textContent = s.z.toFixed(2);
  $("m-top").textContent = `${s.topPercent.toFixed(1)}%`;
  $("m-rank").textContent = `${s.rankIn100}位 / 100人`;

  const better = cat.higherIsBetter ? "大きい" : "小さい";
  $("interpret").textContent =
    `このカテゴリは値が${better}ほど上位なのだ。` +
    `あなたの ${x}${cat.unit} は偏差値 ${s.hensachi.toFixed(1)}、` +
    `良い方から上位 ${s.topPercent.toFixed(1)}% に位置するのだ。`;

  $("meta").textContent =
    `母集団 n=${s.n}（疑似サンプル） / 平均 ${s.mean.toFixed(2)}${cat.unit} / ` +
    `標準偏差 ${s.sd.toFixed(2)} / 出典: ${cat.source}`;

  drawChart(cat, x, s);
}

// 正規分布の確率密度関数(PDF)。
function pdf(v: number, mean: number, sd: number): number {
  const t = (v - mean) / sd;
  return Math.exp(-0.5 * t * t) / (sd * Math.sqrt(2 * Math.PI));
}

function drawChart(cat: Category, x: number, s: StatResult) {
  const lo = s.mean - 4 * s.sd;
  const hi = s.mean + 4 * s.sd;
  const steps = 120;
  const curve: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = lo + ((hi - lo) * i) / steps;
    curve.push({ x: v, y: pdf(v, s.mean, s.sd) });
  }
  const peak = pdf(s.mean, s.mean, s.sd);

  chart?.destroy();
  chart = new Chart($<HTMLCanvasElement>("chart"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "分布",
          data: curve,
          borderColor: "#4caf50",
          backgroundColor: "rgba(76,175,80,0.15)",
          fill: true,
          pointRadius: 0,
        },
        {
          label: "あなた",
          data: [
            { x, y: 0 },
            { x, y: peak },
          ],
          borderColor: "#e53935",
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: {
          display: true,
          text: `${cat.label}（${cat.group}）の分布とあなたの位置（上位 ${s.topPercent.toFixed(
            1,
          )}%）`,
        },
      },
      scales: {
        x: { type: "linear", title: { display: true, text: cat.unit || "値" } },
        y: { display: false },
      },
    },
  });
}

calcBtn.addEventListener("click", run);
valueInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

// DuckDB の初期化完了を待ってからボタンを有効化する。
import("./db").then(({ getConnection }) =>
  getConnection()
    .then(() => {
      calcBtn.disabled = false;
      statusEl.textContent = "準備できたのだ。値を入れて計算するのだ！";
    })
    .catch((err) => {
      statusEl.textContent = `DuckDB の起動に失敗したのだ: ${err.message}`;
    }),
);
