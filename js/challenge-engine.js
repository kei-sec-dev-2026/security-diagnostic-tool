(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SecurityChallenge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const TOTAL_QUESTIONS = 20;
  const POINTS_PER_QUESTION = 5;
  const PASS_SCORE = 90;
  const RECENT_ATTEMPTS = 2;
  const CATEGORY_PLAN = Object.freeze([
    "ネットワークの基礎", "Webとアクセス制御", "安全なWeb開発", "運用と復旧"
  ].map(category => Object.freeze({ category, count: 5 })));

  function validateBank(questions) {
    if (!Array.isArray(questions) || questions.length < TOTAL_QUESTIONS) throw new Error("問題バンクには20問以上が必要です。");
    const ids = new Set();
    for (const question of questions) {
      if (!question || typeof question.id !== "string" || !question.id || ids.has(question.id)) throw new Error("問題IDが不正または重複しています。");
      ids.add(question.id);
      if (![question.category, question.question, question.explanation].every(value => typeof value === "string" && value.trim())) throw new Error("問題文・カテゴリ・解説が必要です。");
      if (!CATEGORY_PLAN.some(plan => plan.category === question.category)) throw new Error("未定義の出題分野です。");
      if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error("各問題には4つの選択肢が必要です。");
      const optionIds = new Set();
      for (const option of question.options) {
        if (!option || typeof option.id !== "string" || !option.id || optionIds.has(option.id) || typeof option.text !== "string" || !option.text.trim()) throw new Error("選択肢IDまたは本文が不正です。");
        optionIds.add(option.id);
      }
      if (!optionIds.has(question.correctOptionId)) throw new Error("正解に対応する選択肢がありません。");
      if (!Array.isArray(question.references) || !question.references.length) throw new Error("各問題には一次資料が必要です。");
      for (const reference of question.references) {
        if (!reference || ![reference.title, reference.section, reference.publisher, reference.url].every(value => typeof value === "string" && value.trim())) {
          throw new Error("各問題には一次資料と参照箇所が必要です。");
        }
        const url = new URL(reference.url);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("出典には公開HTTPSリンクを指定してください。");
      }
    }
    for (const plan of CATEGORY_PLAN) {
      if (questions.filter(question => question.category === plan.category).length < plan.count) throw new Error("各分野に5問以上が必要です。");
    }
    return true;
  }

  function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length !== TOTAL_QUESTIONS) throw new Error("1回の知識テストには20問が必要です。");
    validateBank(questions);
    return true;
  }

  function shuffled(items, random) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("乱数は0以上1未満である必要があります。");
      const target = Math.floor(value * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function shuffleQuestions(questions, random = Math.random) {
    validateQuestions(questions);
    return shuffled(questions.map(question => ({
      ...question,
      options: shuffled(question.options.map(option => ({ ...option })), random),
      references: question.references.map(reference => ({ ...reference }))
    })), random);
  }

  // Only public question IDs are retained, oldest first. Answers and scores never enter history.
  function normalizeHistory(questions, history) {
    const validIds = new Set(questions.map(question => question.id));
    const unique = new Set();
    const result = [];
    if (!Array.isArray(history)) return result;
    for (let index = history.length - 1; index >= 0; index--) {
      const id = history[index];
      if (typeof id !== "string" || !validIds.has(id) || unique.has(id)) continue;
      unique.add(id);
      result.push(id);
      if (result.length === validIds.size) break;
    }
    return result.reverse();
  }

  function selectQuestions(questions, history = [], random = Math.random) {
    validateBank(questions);
    const previous = normalizeHistory(questions, history);
    const seen = new Set(previous);
    const recent = new Set(previous.slice(-TOTAL_QUESTIONS * RECENT_ATTEMPTS));
    const selected = [];
    for (const plan of CATEGORY_PLAN) {
      const pool = questions.filter(question => question.category === plan.category);
      const unseen = shuffled(pool.filter(question => !seen.has(question.id)), random);
      const older = shuffled(pool.filter(question => seen.has(question.id) && !recent.has(question.id)), random);
      // A smaller/custom bank or malformed old history must still produce a full exam.
      const fallback = pool.filter(question => recent.has(question.id))
        .sort((a, b) => previous.indexOf(a.id) - previous.indexOf(b.id));
      selected.push(...[...unseen, ...older, ...fallback].slice(0, plan.count));
    }
    return shuffleQuestions(selected, random);
  }

  function updateHistory(questions, history, attempt) {
    validateBank(questions);
    validateQuestions(attempt);
    const bankIds = new Set(questions.map(question => question.id));
    if (attempt.some(question => !bankIds.has(question.id))) throw new Error("問題バンクに存在しない出題です。");
    return normalizeHistory(questions, [...normalizeHistory(questions, history), ...attempt.map(question => question.id)]);
  }

  function categoryResults(results) {
    const categories = new Map();
    for (const result of results) {
      if (!categories.has(result.category)) categories.set(result.category, { category: result.category, total: 0, correct: 0 });
      const category = categories.get(result.category);
      category.total++;
      if (result.correct) category.correct++;
    }
    return [...categories.values()].map(category => ({ ...category, percent: Math.round(category.correct / category.total * 100) }));
  }

  function gradeAttempt(questions, answers) {
    validateQuestions(questions);
    const selections = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
    const results = questions.map(question => {
      const selectedId = Object.hasOwn(selections, question.id) ? selections[question.id] : null;
      const selected = question.options.find(option => option.id === selectedId);
      return { questionId: question.id, category: question.category, selectedOptionId: selected ? selected.id : null, correct: Boolean(selected && selected.id === question.correctOptionId) };
    });
    const answered = results.filter(result => result.selectedOptionId !== null).length;
    const complete = answered === TOTAL_QUESTIONS;
    if (!complete) return { complete: false, answered, total: TOTAL_QUESTIONS, score: null, passed: null, correctCount: null, results: [], categories: [] };
    const correctCount = results.filter(result => result.correct).length;
    const score = correctCount * POINTS_PER_QUESTION;
    return { complete, answered, total: TOTAL_QUESTIONS, score, passed: score >= PASS_SCORE, correctCount, results, categories: categoryResults(results) };
  }

  return Object.freeze({ TOTAL_QUESTIONS, POINTS_PER_QUESTION, PASS_SCORE, RECENT_ATTEMPTS, CATEGORY_PLAN,
    validateBank, validateQuestions, shuffleQuestions, normalizeHistory, selectQuestions, updateHistory, gradeAttempt, categoryResults });
});
