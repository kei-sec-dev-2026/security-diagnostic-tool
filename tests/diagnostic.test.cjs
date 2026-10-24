"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateQuestions,
  summarize,
  buildReport,
  laneLabels,
} = require("../js/diagnostic.js");

function question(id, overrides = {}) {
  return {
    lane: "personal",
    id,
    category: "アカウント",
    question: `${id} の対策を確認できていますか？`,
    description: "設定画面で確認できます。",
    deductPointsOn: "NO",
    points: 3,
    adviceTitle: `${id} を確認する`,
    adviceText: `${id} の設定を確認しましょう。`,
    priority: "medium",
    optional: false,
    sourceIds: ["example-source"],
    ...overrides,
  };
}

function completeCatalog() {
  return ["personal", "admin", "it", "dev"].flatMap((lane) =>
    Array.from({ length: 40 }, (_, index) =>
      question(`${lane}_${index + 1}`, { lane }),
    ),
  );
}

function answersFor(questions, value) {
  return Object.fromEntries(questions.map(({ id }) => [id, value]));
}

test("公開質問データは4コース各40問の有効なカタログである", () => {
  const questions = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/questions.json"), "utf8"),
  );
  assert.equal(questions.length, 160);
  for (const lane of ["personal", "admin", "it", "dev"]) {
    assert.equal(questions.filter((item) => item.lane === lane).length, 40);
    assert.equal(typeof laneLabels[lane], "string");
    assert.ok(laneLabels[lane].trim());
  }
  assert.equal(validateQuestions(questions), true);
});

test("読込時に壊れたカタログと重複IDを拒否する", () => {
  assert.equal(validateQuestions(completeCatalog()), true);
  for (const input of [null, {}, [], completeCatalog().slice(1)]) {
    assert.throws(() => validateQuestions(input));
  }
  const duplicate = completeCatalog();
  duplicate[1].id = duplicate[0].id;
  assert.throws(() => validateQuestions(duplicate));
});

test("質問の回答方向・重要度・対象外可否・出典が不正なら開始させない", () => {
  const invalidFields = [
    { lane: "unknown-course" },
    { id: "" },
    { category: " " },
    { question: "" },
    { description: null },
    { adviceTitle: "" },
    { adviceText: "" },
    { deductPointsOn: "YES" },
    { priority: "critical" },
    { points: 0 },
    { points: 1.5 },
    { optional: "false" },
    { sourceIds: [] },
    { sourceIds: [""] },
  ];
  for (const invalid of invalidFields) {
    const questions = completeCatalog();
    Object.assign(questions[0], invalid);
    assert.throws(() => validateQuestions(questions), JSON.stringify(invalid));
  }
});

test("全回答が対策済みなら100%で、改善項目はない", () => {
  const questions = [question("one"), question("two")];
  const result = summarize(questions, answersFor(questions, "YES"));
  assert.deepEqual(result.counts, { YES: 2, NO: 0, UNKNOWN: 0, NA: 0 });
  assert.equal(result.total, 2);
  assert.equal(result.answered, 2);
  assert.equal(result.applicable, 2);
  assert.equal(result.confirmedPercent, 100);
  assert.deepEqual(result.actions, []);
});

test("いいえと未確認は同じ割合でも別の状態として保持する", () => {
  const questions = [question("one"), question("two")];
  const no = summarize(questions, answersFor(questions, "NO"));
  const unknown = summarize(questions, answersFor(questions, "UNKNOWN"));
  assert.equal(no.confirmedPercent, 0);
  assert.equal(unknown.confirmedPercent, 0);
  assert.equal(no.counts.NO, 2);
  assert.equal(unknown.counts.UNKNOWN, 2);
  assert.equal(unknown.counts.NO, 0);
  assert.ok(no.actions.every((item) => item.answer === "NO"));
  assert.ok(unknown.actions.every((item) => item.answer === "UNKNOWN"));
});

test("対象外は割合の分母から除外し、全て対象外なら割合を出さない", () => {
  const questions = [
    question("one"),
    question("two", { optional: true }),
    question("three", { optional: true }),
  ];
  const mixed = summarize(questions, { one: "YES", two: "NA", three: "NA" });
  assert.equal(mixed.confirmedPercent, 100);
  assert.equal(mixed.applicable, 1);
  assert.equal(mixed.counts.NA, 2);
  assert.equal(mixed.answered, 3);

  const optionalQuestions = questions.slice(1);
  const allNA = summarize(optionalQuestions, answersFor(optionalQuestions, "NA"));
  assert.equal(allNA.applicable, 0);
  assert.equal(allNA.confirmedPercent, null);
  assert.deepEqual(allNA.actions, []);
  assert.equal(summarize([], {}).confirmedPercent, null);
});

test("不正回答・必須項目の対象外・無回答で割合を水増ししない", () => {
  const questions = [question("one"), question("two"), question("three")];
  const result = summarize(questions, { one: "YES", two: "NA", three: "INVALID", extra: "YES" });
  assert.equal(result.answered, 1);
  assert.equal(result.applicable, 3);
  assert.equal(result.confirmedPercent, 33);
  assert.deepEqual(result.counts, { YES: 1, NO: 0, UNKNOWN: 0, NA: 0 });
  assert.deepEqual(result.actions, []);
  assert.equal(summarize(questions, {}).confirmedPercent, 0);
});

test("戻って回答を修正しても旧回答を二重計上しない", () => {
  const questions = [question("one"), question("two")];
  const answers = { one: "NO", two: "UNKNOWN" };
  assert.equal(summarize(questions, answers).actions.length, 2);
  answers.one = "YES";
  const result = summarize(questions, answers);
  assert.deepEqual(result.counts, { YES: 1, NO: 0, UNKNOWN: 1, NA: 0 });
  assert.equal(result.confirmedPercent, 50);
  assert.deepEqual(result.actions.map((item) => item.question.id), ["two"]);
});

test("改善項目は重要度順、同じ重要度ならいいえを先にし、同条件は質問順を保つ", () => {
  const questions = [
    question("medium-unknown", { priority: "medium" }),
    question("high-unknown", { priority: "high" }),
    question("low-no", { priority: "low" }),
    question("high-no-first", { priority: "high" }),
    question("high-no-second", { priority: "high" }),
    question("medium-no", { priority: "medium" }),
    question("high-yes", { priority: "high" }),
  ];
  const answers = {
    "medium-unknown": "UNKNOWN",
    "high-unknown": "UNKNOWN",
    "low-no": "NO",
    "high-no-first": "NO",
    "high-no-second": "NO",
    "medium-no": "NO",
    "high-yes": "YES",
  };
  assert.deepEqual(
    summarize(questions, answers).actions.map((item) => item.question.id),
    ["high-no-first", "high-no-second", "high-unknown", "medium-no", "medium-unknown", "low-no"],
  );
});

test("レポートは全改善項目と未確認を含み、実検査や安全保証と誤認させない", () => {
  const questions = [
    question("alpha", { priority: "high" }),
    question("beta"),
    question("gamma", { priority: "low" }),
    question("delta", { priority: "low" }),
    question("optional", { optional: true }),
  ];
  const summary = summarize(questions, {
    alpha: "NO", beta: "UNKNOWN", gamma: "NO", delta: "NO", optional: "NA",
  });
  const report = buildReport("personal", summary, "2026-10-24");
  assert.equal(typeof report, "string");
  assert.ok(report.includes(laneLabels.personal));
  assert.ok(report.includes("2026-10-24"));
  assert.match(report, /未確認/);
  assert.match(report, /対象外/);
  assert.match(report, /自己|回答/);
  assert.match(report, /保証|実際の|脆弱性/);
  for (const item of summary.actions) {
    assert.ok(report.includes(item.question.adviceTitle));
    assert.ok(report.includes(item.question.adviceText));
  }
});
