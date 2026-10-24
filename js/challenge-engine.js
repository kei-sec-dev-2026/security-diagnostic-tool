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

  function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length !== TOTAL_QUESTIONS) throw new Error("知識テストには20問が必要です。");
    const ids = new Set();
    for (const question of questions) {
      if (!question || typeof question.id !== "string" || !question.id || ids.has(question.id)) throw new Error("問題IDが不正または重複しています。");
      ids.add(question.id);
      if (![question.category, question.question, question.explanation].every(value => typeof value === "string" && value.trim())) throw new Error("問題文・カテゴリ・解説が必要です。");
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

  return Object.freeze({ TOTAL_QUESTIONS, POINTS_PER_QUESTION, PASS_SCORE, validateQuestions, shuffleQuestions, gradeAttempt, categoryResults });
});
