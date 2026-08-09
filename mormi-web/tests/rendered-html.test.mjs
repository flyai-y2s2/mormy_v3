import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the full Morami mathematics curriculum", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /2022 개정 수학과 교육과정 연계/);
  assert.match(html, /수학 영역을 골라 봐요/);
  assert.match(html, /무엇을 공부할까요/);
  assert.match(html, /수와 연산/);
  assert.match(html, /변화와 관계/);
  assert.match(html, /도형과 측정/);
  assert.match(html, /자료와 가능성/);
  assert.match(html, /2022 개정 수학과 교육과정 연계/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps four official areas and 36 playable sessions in the curriculum", async () => {
  const [curriculum, original, app, css] = await Promise.all([
    readFile(new URL("../app/math-curriculum.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/morami-content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal((curriculum.match(/\blesson\(\{/g) || []).length, 24);
  assert.equal((original.match(/^ {4}id: "/gm) || []).length, 12);
  assert.equal((curriculum.match(/title: "(?:수와 연산|변화와 관계|도형과 측정|자료와 가능성)"/g) || []).length, 4);
  assert.match(curriculum, /export const sessions: Session\[\]/);
  assert.match(curriculum, /\[2수01-05\]/);
  assert.match(curriculum, /\[2수03-07\]/);
  assert.match(curriculum, /\[6수04-04\]/);
  assert.match(curriculum, /curriculumForSession/);
  assert.match(app, /useState<Stage>\("curriculum"\)/);
  assert.match(app, /morami-completed-sessions/);
  assert.match(app, /현장 미션/);
  assert.match(app, /LifeMissionGame/);
  assert.match(app, /life-missions\/cafe\.webp/);
  assert.match(app, /life-missions\/market\.webp/);
  assert.match(app, /life-missions\/stationery\.jpg/);
  assert.match(app, /life-missions\/toyshop\.jpg/);
  assert.match(app, /life-missions\/snackshop\.jpg/);
  assert.match(app, /life-missions\/giftshop\.jpg/);
  assert.match(app, /life-missions\/workshop\.webp/);
  assert.match(app, /life-missions\/fair\.webp/);
  assert.match(app, /products\/notebook\.jpg/);
  assert.match(app, /products\/pencil\.jpg/);
  assert.match(app, /function sceneForProduct/);
  assert.match(app, /problem\.visual\.type === "money" \? <StoreOrder/);
  assert.doesNotMatch(app, /story\.scene === "cafe" \? <CafeOrder/);
  assert.match(app, /selectedAreaId/);
  assert.match(app, /math-areas\/add-subtract\.webp/);
  assert.match(app, /math-area-visual/);
  assert.match(app, /4개 영역으로/);
  assert.match(app, /지금 열려 있는 맞춤 연습/);
  assert.match(curriculum, /gradeBands/);
  assert.match(curriculum, /3~4학년군/);
  assert.match(curriculum, /5~6학년군/);
  assert.match(curriculum, /export const transferTarget = 3/);
  assert.match(app, /varyProblem/);
  assert.match(app, /shuffleProblemAnswers/);
  assert.match(app, /ensureFourAnswers/);
  assert.match(app, /answers\.length >= 4/);
  assert.match(app, /selectedDrillAnswer/);
  assert.match(css, /\.answer-grid button\.is-correct/);
  assert.match(css, /\.answer-grid button\.is-wrong/);
  assert.match(css, /↻ 한 번 더/);
  assert.doesNotMatch(css, /× 다시 생각/);
  assert.match(css, /grid-template-columns: repeat\(4, 1fr\)/);
  assert.match(app, /correctPosition = Math\.abs\(seed\) % \(answers\.length \+ 1\)/);
  assert.match(app, /shuffleProblemAnswers\(varyProblem\(problem, seed\), seed\)/);
  assert.match(app, /sentenceBank\.map/);
  assert.doesNotMatch(app, /selectedWords\.includes\(word\)/);
  assert.match(app, /mark === missing \? "\?" : mark/);
  assert.doesNotMatch(app, /<i \/>\{mark\}<\/span>/);
  assert.match(app, /extraLifeProblem/);
  assert.match(app, /내 생각을 먼저 써 봐요/);
  assert.match(app, /먼저 직접 써서 모르미에게 알려 줘요/);
  assert.match(app, /보기에서 골라 모르미에게 알려 줘요/);
  assert.match(app, /mission-morami/);
  assert.match(app, /● 동그라미/);
  assert.doesNotMatch(app, /잘 모르겠어요 · 보기 열기/);
  assert.match(app, /말로 알려주기/);
  assert.match(app, /SpeechRecognition/);
  assert.doesNotMatch(css, /\.report-link \{ display:none; \}/);
  assert.match(app, /playLearningChime/);
  assert.match(app, /const notes = \[659\.25, 783\.99, 1046\.5\]/);
  assert.match(app, /if \(soundOn\) playLearningChime\(\)/);
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(curriculum, /export const masteryTarget = 10/);
  assert.match(app, /const stageLabels = \["혼자 연습"/);
  assert.match(app, /setStage\("drill"\)/);
  assert.match(app, /drill-board drill-board--solo/);
  assert.doesNotMatch(app, /stage === "memory"|morami-side|어느 바늘부터|바늘을 하나씩/);

  const classifyStart = curriculum.indexOf('id: "data-classify"');
  const classifyEnd = curriculum.indexOf('id: "data-chart"');
  const classifyBlock = curriculum.slice(classifyStart, classifyEnd);
  assert.doesNotMatch(classifyBlock, /focus:/);
  assert.doesNotMatch(classifyBlock, /missingIndex: [0-9]/);
  assert.doesNotMatch(original, /focus\?: number/);
  assert.doesNotMatch(app, /visual\.focus|index === focus/);
  assert.doesNotMatch(css, /\.shapes-visual span\.is-focus/);

  const calendarStart = curriculum.indexOf('id: "time-calendar"');
  const calendarEnd = curriculum.indexOf('id: "measure-compare"');
  const calendarBlock = curriculum.slice(calendarStart, calendarEnd);
  assert.match(calendarBlock, /8월 8일에서 사흘 뒤는\?/);
  assert.match(calendarBlock, /12월 24일에서 일주일 뒤는\?/);
  assert.doesNotMatch(calendarBlock, /correct: "8일"|highlight: 31/);
});

test("server-renders the adult mathematics report", async () => {
  const response = await render("/report");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /학습 리포트/);
  assert.match(html, /반복 시도/);
  assert.match(html, /전이 확인/);
});
