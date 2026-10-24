"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { questions } = require("../data/challenge.json");
const { validateQuestions, shuffleQuestions, gradeAttempt } = require("../js/challenge-engine.js");
const copy = (value) => JSON.parse(JSON.stringify(value));
const answersWithCorrect = (count, queue = questions) => Object.fromEntries(queue.map((q, index) => [q.id,
  index < count ? q.correctOptionId : q.options.find(option => option.id !== q.correctOptionId).id]));

test("公開チャレンジはネットワークからWeb開発・運用までの20問で、各問に根拠がある", () => {
  assert.equal(validateQuestions(questions), true);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(q => q.category)).size, 4);
  assert.ok(questions.some(q => q.category.includes("ネットワーク")));
  assert.ok(questions.some(q => q.category.includes("Web")));
  assert.ok(questions.some(q => q.category.includes("復旧")));
});

test("合否の境界は18問正解90点で合格、17問正解85点で不合格", () => {
  for (const [count, score, passed] of [[0, 0, false], [17, 85, false], [18, 90, true], [19, 95, true], [20, 100, true]]) {
    const result = gradeAttempt(questions, answersWithCorrect(count));
    assert.equal(result.complete, true);
    assert.equal(result.score, score);
    assert.equal(result.passed, passed);
    assert.equal(result.correctCount, count);
    assert.equal(result.categories.reduce((sum, category) => sum + category.total, 0), 20);
    assert.equal(result.categories.reduce((sum, category) => sum + category.correct, 0), count);
  }
});

test("未回答・不正な選択肢で分母を減らしたり、合否を先に出したりしない", () => {
  const incomplete = answersWithCorrect(20);
  delete incomplete[questions[19].id];
  const invalid = answersWithCorrect(20);
  invalid[questions[19].id] = "not-an-option";
  for (const answers of [incomplete, invalid, null, [], {}]) {
    const result = gradeAttempt(questions, answers);
    assert.equal(result.complete, false);
    assert.equal(result.total, 20);
    assert.equal(result.score, null);
    assert.equal(result.passed, null);
    assert.deepEqual(result.results, []);
  }
});

test("回答修正は同じ問題の選択を置き換え、二重計上しない", () => {
  const answers = answersWithCorrect(17);
  assert.equal(gradeAttempt(questions, answers).score, 85);
  answers[questions[17].id] = questions[17].correctOptionId;
  const result = gradeAttempt(questions, answers);
  assert.equal(result.score, 90);
  assert.equal(result.answered, 20);
  assert.equal(result.passed, true);
});

test("問題と選択肢を並べ替えてもIDで正しく採点し、原稿を変更しない", () => {
  const original = copy(questions);
  const answers = answersWithCorrect(20);
  for (const value of [0, 0.5, 0.999999]) {
    const shuffled = shuffleQuestions(questions, () => value);
    assert.deepEqual(shuffled.map(q => q.id).sort(), questions.map(q => q.id).sort());
    for (const q of shuffled) {
      const source = questions.find(row => row.id === q.id);
      assert.notEqual(q, source);
      assert.notEqual(q.options, source.options);
      assert.deepEqual(q.options.map(option => option.id).sort(), source.options.map(option => option.id).sort());
    }
    assert.equal(gradeAttempt(shuffled, answers).score, 100);
    assert.deepEqual(questions, original);
  }
  assert.throws(() => shuffleQuestions(questions, () => 1));
});

test("欠損カタログ・曖昧なID・壊れた根拠リンクでは開始しない", () => {
  assert.throws(() => validateQuestions(questions.slice(1)));
  for (const change of [
    rows => { rows[1].id = rows[0].id; },
    rows => { rows[0].options[1].id = rows[0].options[0].id; },
    rows => { rows[0].correctOptionId = "missing"; },
    rows => { rows[0].references = []; },
    rows => { rows[0].references[0].url = "https://"; },
    rows => { rows[0].references[0].url = "http://example.com"; },
  ]) {
    const rows = copy(questions);
    change(rows);
    assert.throws(() => validateQuestions(rows));
  }
});
