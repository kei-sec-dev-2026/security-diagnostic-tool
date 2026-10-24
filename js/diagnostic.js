/* Shared by the browser and the dependency-free Node test runner. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Diagnostic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const laneLabels = Object.freeze({ personal: "個人・ご家庭", admin: "会社・チームの管理者", it: "システム担当者", dev: "開発者・AI開発者" });
  const assessmentLabels = Object.freeze({ quick: "重要12問", full: "詳しく40問" });
  const priorities = { high: 0, medium: 1, low: 2 };
  const priorityLabels = { high: "優先して確認", medium: "次に取り組む", low: "少しずつ整える" };
  const answerLabels = { YES: "対策済み", NO: "見直したい", UNKNOWN: "未確認", NA: "対象外" };

  function validateQuestions(questions) {
    if (!Array.isArray(questions)) throw new Error("質問データが配列ではありません。");
    const ids = new Set();
    const counts = Object.fromEntries(Object.keys(laneLabels).map((lane) => [lane, 0]));
    const quickCounts = { ...counts };
    for (const q of questions) {
      if (!q || !Object.hasOwn(laneLabels, q.lane)) throw new Error("不明なコースです。");
      for (const key of ["id", "category", "question", "description", "adviceTitle", "adviceText"]) {
        if (typeof q[key] !== "string" || !q[key].trim()) throw new Error(`質問の ${key} が不正です。`);
      }
      if (ids.has(q.id)) throw new Error(`質問IDが重複しています: ${q.id}`);
      ids.add(q.id);
      if (q.deductPointsOn !== "NO" || !Number.isInteger(q.points) || q.points <= 0 ||
          !Object.hasOwn(priorities, q.priority) || typeof q.optional !== "boolean" ||
          !Array.isArray(q.sourceIds) || !q.sourceIds.length ||
          q.sourceIds.some((id) => typeof id !== "string" || !id.trim()) ||
          typeof q.quickCheck !== "boolean" || !Array.isArray(q.references) || !q.references.length ||
          q.references.some((ref) => !ref || typeof ref.sourceId !== "string" || !q.sourceIds.includes(ref.sourceId) ||
            typeof ref.section !== "string" || !ref.section.trim())) throw new Error(`質問の設定が不正です: ${q.id}`);
      counts[q.lane]++;
      if (q.quickCheck) quickCounts[q.lane]++;
    }
    if (Object.values(counts).some((count) => count !== 40)) throw new Error("各コースに40問が必要です。");
    if (Object.values(quickCounts).some((count) => count !== 12)) throw new Error("各コースの重要な質問を12問選んでください。");
    return true;
  }

  function validateSources(questions, sourceData) {
    if (!sourceData || !/^\d{4}-\d{2}-\d{2}$/.test(sourceData.updatedAt) ||
        !Array.isArray(sourceData.sources) || !sourceData.sources.length) throw new Error("出典データの形式が不正です。");
    const ids = new Set();
    for (const source of sourceData.sources) {
      if (!source || ["id", "title", "url", "publisher"].some((key) => typeof source[key] !== "string" || !source[key].trim()) ||
          ids.has(source.id) || !["government", "standard", "vendor"].includes(source.kind)) throw new Error("出典の設定が不正です。");
      const url = new URL(source.url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("出典には公開HTTPSリンクを指定してください。");
      ids.add(source.id);
    }
    if (questions.some((q) => q.sourceIds.some((id) => !ids.has(id)) ||
        q.references.some((ref) => !ids.has(ref.sourceId)))) throw new Error("質問に対応する出典がありません。");
    return true;
  }

  function selectQuestions(questions, lane, scope = "quick") {
    if (!Array.isArray(questions) || !Object.hasOwn(laneLabels, lane) || !Object.hasOwn(assessmentLabels, scope)) {
      throw new Error("コースまたはチェック範囲が不正です。");
    }
    const selected = questions.filter((q) => q.lane === lane);
    const quick = selected.filter((q) => q.quickCheck);
    return scope === "quick" ? quick : [...quick, ...selected.filter((q) => !q.quickCheck)];
  }

  function summarize(questions, answers = {}) {
    const counts = { YES: 0, NO: 0, UNKNOWN: 0, NA: 0 };
    const actions = [];
    questions.forEach((q, index) => {
      const answer = answers[q.id];
      if (!Object.hasOwn(counts, answer) || (answer === "NA" && !q.optional)) return;
      counts[answer]++;
      if (answer === "NO" || answer === "UNKNOWN") actions.push({ question: q, answer, index });
    });
    actions.sort((a, b) => (priorities[a.question.priority] - priorities[b.question.priority]) ||
      ((a.answer === "NO" ? 0 : 1) - (b.answer === "NO" ? 0 : 1)) || a.index - b.index);
    const applicable = questions.length - counts.NA;
    return { counts, total: questions.length, answered: Object.values(counts).reduce((sum, count) => sum + count, 0),
      applicable, confirmedPercent: applicable > 0 ? Math.round(counts.YES / applicable * 100) : null, actions };
  }

  function buildReport(lane, summary, updatedAt, scope = "full", sources = []) {
    const { counts, applicable, actions, confirmedPercent } = summary;
    const lines = ["セキュリティのいまを知る — 自己チェック結果", `コース: ${laneLabels[lane] || lane}`,
      `チェック範囲: ${assessmentLabels[scope] || scope}（${summary.total}項目）`,
      `質問の見直し日: ${updatedAt || "未取得"}`,
      `対策済みの割合: ${confirmedPercent === null ? "算出対象なし" : `${confirmedPercent}%`}`,
      `対策済み ${counts.YES} / 対象項目 ${applicable}（対象外を分母から除外）`,
      `見直したい: ${counts.NO}件 / 未確認: ${counts.UNKNOWN}件 / 対象外: ${counts.NA}件`, "",
      ...(scope === "quick" ? ["重要12問だけの結果です。残り28問はこの結果に含まれず、確認していません。"] : []),
      "この結果は回答に基づく自己点検です。実際の脆弱性や侵入の有無、安全性を保証するものではありません。",
      "未確認は対策ができていないと断定せず、設定や担当者に確認する項目です。", "", "取り組むこと・確認すること"];
    if (!actions.length) lines.push("今回の回答では見直し・未確認の項目はありません。定期的に設定を確かめましょう。");
    actions.forEach(({ question: q, answer }, index) => {
      lines.push(`${index + 1}. [${priorityLabels[q.priority]} / ${answerLabels[answer]}] ${q.adviceTitle}`, `   質問: ${q.question}`);
      if (answer === "UNKNOWN") lines.push("   まず設定や担当者に確認し、必要に応じて次の対策を進めてください。");
      lines.push(`   ${q.adviceText}`, "");
      for (const ref of q.references || []) {
        const source = sources.find((entry) => entry.id === ref.sourceId);
        if (source) lines.push(`   参考: ${source.title} / ${ref.section}`, `   ${source.url}`);
      }
      if (sources.length) lines.push("");
    });
    lines.push("回答はこのブラウザ内で処理し、アプリから送信・自動保存していません。",
      "このレポートを共有する場合は、組織の設定や弱点が推測される内容の取り扱いに気をつけてください。");
    return lines.join("\n");
  }
  return Object.freeze({ validateQuestions, validateSources, selectQuestions, summarize, buildReport, laneLabels, assessmentLabels, priorityLabels, answerLabels });
});
