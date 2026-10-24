"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateQuestions,
  validateSources,
  selectQuestions,
  summarize,
  buildReport,
  laneLabels,
  assessmentLabels,
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
    quickCheck: false,
    references: [{ sourceId: "example-source", section: "Account protection" }],
    ...overrides,
  };
}

function completeCatalog() {
  return ["personal", "admin", "it", "dev"].flatMap((lane) =>
    Array.from({ length: 40 }, (_, index) =>
      question(`${lane}_${index + 1}`, { lane, quickCheck: index < 12 }),
    ),
  );
}

function answersFor(questions, value) {
  return Object.fromEntries(questions.map(({ id }) => [id, value]));
}

function sourceCatalog() {
  return {
    updatedAt: "2026-10-24",
    sources: [{
      id: "example-source",
      title: "Account Security Guide",
      url: "https://example.com/account-security",
      publisher: "Example Standards Organization",
      kind: "standard",
    }],
  };
}

test("公開質問データは4コース各40問の有効なカタログである", () => {
  const questions = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/questions.json"), "utf8"),
  );
  const sources = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/sources.json"), "utf8"),
  );
  assert.equal(questions.length, 160);
  for (const lane of ["personal", "admin", "it", "dev"]) {
    assert.equal(questions.filter((item) => item.lane === lane).length, 40);
    assert.equal(questions.filter((item) => item.lane === lane && item.quickCheck).length, 12);
    assert.equal(typeof laneLabels[lane], "string");
    assert.ok(laneLabels[lane].trim());
  }
  assert.equal(validateQuestions(questions), true);
  assert.equal(validateSources(questions, sources), true);
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
    { quickCheck: undefined },
    { quickCheck: "true" },
    { references: [] },
    { references: [null] },
    { references: [{ sourceId: "", section: "Account protection" }] },
    { references: [{ sourceId: "example-source", section: " " }] },
    { references: [{ sourceId: "unlisted-source", section: "Account protection" }] },
  ];
  for (const invalid of invalidFields) {
    const questions = completeCatalog();
    Object.assign(questions[0], invalid);
    assert.throws(() => validateQuestions(questions), JSON.stringify(invalid));
  }
});

test("標準チェックは各コース12問で、詳しいチェックは同じ12問から残り28問へ続く", () => {
  const questions = completeCatalog();
  // Interleave the selected questions so a plain 40-question filter cannot pass.
  for (const lane of ["personal", "admin", "it", "dev"]) {
    questions.filter((q) => q.lane === lane).forEach((q, index) => {
      q.quickCheck = index < 24 && index % 2 === 0;
    });
  }
  const originalIds = questions.map((q) => q.id);
  for (const lane of ["personal", "admin", "it", "dev"]) {
    const original = questions.filter((q) => q.lane === lane);
    const quick = selectQuestions(questions, lane);
    const full = selectQuestions(questions, lane, "full");
    assert.equal(quick.length, 12);
    assert.equal(full.length, 40);
    assert.deepEqual(quick.map((q) => q.id), original.filter((q) => q.quickCheck).map((q) => q.id));
    assert.deepEqual(full.slice(0, 12).map((q) => q.id), quick.map((q) => q.id));
    assert.deepEqual(full.slice(12).map((q) => q.id), original.filter((q) => !q.quickCheck).map((q) => q.id));
    assert.equal(new Set(full.map((q) => q.id)).size, 40);
  }
  assert.deepEqual(questions.map((q) => q.id), originalIds);
  assert.throws(() => selectQuestions(questions, "unknown-course"));
  assert.throws(() => selectQuestions(questions, "personal", "unknown-scope"));
});

test("標準12問の件数不足・超過を読込時に拒否する", () => {
  const tooFew = completeCatalog();
  tooFew[0].quickCheck = false;
  assert.throws(() => validateQuestions(tooFew));
  const tooMany = completeCatalog();
  tooMany[12].quickCheck = true;
  assert.throws(() => validateQuestions(tooMany));
});

test("標準結果に残り28問を混ぜず、同じ回答を引き継いで40問へ継続できる", () => {
  const questions = completeCatalog();
  const quick = selectQuestions(questions, "personal", "quick");
  const full = selectQuestions(questions, "personal", "full");
  const answers = answersFor(quick, "YES");
  const initial = summarize(quick, answers);
  assert.equal(initial.total, 12);
  assert.equal(initial.answered, 12);
  assert.equal(initial.applicable, 12);
  assert.equal(initial.confirmedPercent, 100);
  assert.equal(summarize(full, answers).answered, 12);
  for (const q of full.slice(12)) answers[q.id] = "NO";
  assert.equal(summarize(quick, answers).confirmedPercent, 100);
  const continued = summarize(full, answers);
  assert.equal(continued.total, 40);
  assert.equal(continued.answered, 40);
  assert.deepEqual(continued.counts, { YES: 12, NO: 28, UNKNOWN: 0, NA: 0 });
  assert.equal(continued.confirmedPercent, 30);
  answers[quick[0].id] = "UNKNOWN";
  assert.deepEqual(summarize(full, answers).counts, { YES: 11, NO: 28, UNKNOWN: 1, NA: 0 });
});

test("出典の形式と質問の参照を検証し、存在しない根拠を表示しない", () => {
  const questions = completeCatalog();
  assert.equal(validateSources(questions, sourceCatalog()), true);
  for (const kind of ["government", "standard", "vendor"]) {
    const sources = sourceCatalog();
    sources.sources[0].kind = kind;
    assert.equal(validateSources(questions, sources), true);
  }
  for (const data of [null, {}, { updatedAt: "2026-10-24", sources: [] }, { ...sourceCatalog(), updatedAt: "2026/10/24" }]) {
    assert.throws(() => validateSources(questions, data));
  }
  for (const invalid of [
    { id: " " }, { title: "" }, { publisher: "" }, { kind: "blog" },
    { url: "http://example.com/guide" }, { url: "javascript:alert(1)" }, { url: "https://" },
  ]) {
    const sources = sourceCatalog();
    Object.assign(sources.sources[0], invalid);
    assert.throws(() => validateSources(questions, sources), JSON.stringify(invalid));
  }
  const duplicate = sourceCatalog();
  duplicate.sources.push({ ...duplicate.sources[0] });
  assert.throws(() => validateSources(questions, duplicate));
  const unresolved = completeCatalog();
  unresolved[0].sourceIds.push("missing-source");
  assert.throws(() => validateSources(unresolved, sourceCatalog()));
  const badReference = completeCatalog();
  badReference[0].references[0].sourceId = "missing-source";
  assert.throws(() => validateSources(badReference, sourceCatalog()));
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

test("レポートで12問と40問の範囲を区別し、改善項目の根拠節とURLを持ち出せる", () => {
  const questions = completeCatalog();
  const quick = selectQuestions(questions, "personal");
  const answers = answersFor(quick, "YES");
  answers[quick[0].id] = "NO";
  const sources = sourceCatalog().sources;
  const summary = summarize(quick, answers);
  const quickReport = buildReport("personal", summary, "2026-10-24", "quick", sources);
  assert.match(assessmentLabels.quick, /12問/);
  assert.match(assessmentLabels.full, /40問/);
  assert.match(quickReport, /重要12問/);
  assert.match(quickReport, /28問/);
  assert.match(quickReport, /評価|対象/);
  assert.match(quickReport, /保証/);
  assert.ok(quickReport.includes(sources[0].title));
  assert.ok(quickReport.includes(quick[0].references[0].section));
  assert.ok(quickReport.includes(sources[0].url));

  const full = selectQuestions(questions, "personal", "full");
  Object.assign(answers, answersFor(full.slice(12), "YES"));
  const fullSummary = summarize(full, answers);
  const fullReport = buildReport("personal", fullSummary, "2026-10-24", "full", sources);
  assert.match(fullReport, /詳しく40問/);
  assert.ok(fullReport.includes(sources[0].url));
  assert.match(buildReport("personal", fullSummary, "2026-10-24"), /詳しく40問/);
});
