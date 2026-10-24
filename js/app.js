(function () {
  "use strict";
  const { validateQuestions, validateSources, selectQuestions, summarize, buildReport, laneLabels, assessmentLabels, priorityLabels, answerLabels } = window.Diagnostic;
  const state = { questions: [], sources: [], updatedAt: "", lane: null, scope: "quick", queue: [], answers: {}, step: 0, view: "start", ready: false, loading: false, revision: 0 };
  let advanceTimer = null;
  const $ = (id) => document.getElementById(id);
  const setText = (id, value) => { $(id).textContent = value; };
  const toggle = (id, visible) => {
    const element = $(id);
    element.hidden = !visible;
    element.classList.toggle("hidden", !visible);
  };
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  async function readJSON(path) {
    const response = await fetch(path, { credentials: "omit", cache: "no-cache" });
    if (!response.ok) throw new Error("データの読み込みに失敗しました (" + response.status + ")");
    return response.json();
  }

  async function loadQuestions() {
    if (state.loading) return;
    state.loading = true;
    state.ready = false;
    $("retry-load").disabled = true;
    document.querySelectorAll('[data-action="start"]').forEach((button) => { button.disabled = true; });
    toggle("loading-status", true);
    toggle("load-error", false);
    try {
      const [questions, sourceData] = await Promise.all([readJSON("data/questions.json"), readJSON("data/sources.json")]);
      validateQuestions(questions);
      validateSources(questions, sourceData);
      state.questions = questions;
      state.sources = sourceData.sources;
      state.updatedAt = sourceData.updatedAt;
      state.ready = true;
      document.querySelectorAll("[data-lane-count]").forEach((element) => {
        element.textContent = selectQuestions(questions, element.dataset.laneCount).length + "問から";
      });
      renderSources();
      document.querySelectorAll('[data-action="start"]').forEach((button) => { button.disabled = false; });
    } catch (error) {
      toggle("load-error", true);
      console.error("チェックに必要なデータを読み込めませんでした。", error);
    } finally {
      state.loading = false;
      $("retry-load").disabled = false;
      toggle("loading-status", false);
    }
  }

  function showView(view, focusId) {
    state.view = view;
    toggle("lane-select-card", view === "start");
    toggle("question-card", view === "question");
    toggle("result-card", view === "result");
    toggle("challenge-card", view === "challenge");
    if (focusId) $(focusId).focus();
  }

  function start(lane) {
    if (!state.ready || !Object.hasOwn(laneLabels, lane)) return;
    state.revision++;
    state.lane = lane;
    state.scope = "quick";
    state.queue = selectQuestions(state.questions, lane, state.scope);
    state.answers = {};
    state.step = 0;
    renderQuestion();
    showView("question", "question-text");
  }

  function updateAnswers() {
    const q = state.queue[state.step];
    const selected = state.answers[q.id];
    document.querySelectorAll("[data-answer]").forEach((button) => {
      const active = button.dataset.answer === selected;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("selected", active);
      button.disabled = advanceTimer !== null || (button.dataset.answer === "NA" && !q.optional);
    });
    setText("answer-feedback", selected ? "「" + answerLabels[selected] + "」を選択しています。" : "");
    const completed = summarize(state.queue, state.answers).answered;
    const percent = Math.round(completed / state.queue.length * 100);
    setText("progress-percent", percent + "%");
    $("progress-bar-fill").style.width = percent + "%";
    $("question-progress").setAttribute("aria-valuenow", String(completed));
    $("question-progress").setAttribute("aria-valuemax", String(state.queue.length));
    $("question-progress").setAttribute("aria-valuetext", state.queue.length + "問のうち" + completed + "問に回答済み");
  }

  function cancelAdvance() {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function renderQuestion() {
    cancelAdvance();
    const q = state.queue[state.step];
    setText("question-course", laneLabels[state.lane] + " · " + assessmentLabels[state.scope]);
    setText("progress-text", "質問 " + (state.step + 1) + " / " + state.queue.length);
    setText("question-category", q.category);
    setText("question-text", q.question);
    setText("question-desc", q.description);
    $("question-source-details").open = false;
    renderReferences(q, $("question-sources"));
    setText("question-hint", q.optional ? "使っていない機能・環境なら「対象外」を選べます。迷ったら「わからない」で大丈夫です。" : "設定をまだ確認していないときは「わからない」で大丈夫です。");
    const na = $("answer-na");
    na.hidden = !q.optional;
    na.classList.toggle("hidden", !q.optional);
    na.disabled = !q.optional;
    $("previous-button").disabled = state.step === 0;
    toggle("return-results-button", summarize(state.queue, state.answers).answered === state.queue.length);
    setText("answer-instructions", state.step === state.queue.length - 1
      ? "回答を選ぶと、チェック結果を表示します。"
      : "回答を選ぶと、自動で次の質問へ進みます。");
    updateAnswers();
  }

  function answer(value) {
    if (state.view !== "question" || advanceTimer !== null) return;
    const q = state.queue[state.step];
    if (!Object.hasOwn(answerLabels, value) || (value === "NA" && !q.optional)) return;
    state.answers[q.id] = value;
    const revision = state.revision;
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      if (state.revision !== revision || state.view !== "question" ||
          state.queue[state.step]?.id !== q.id || $("reset-dialog").open) return;
      next();
    }, 250);
    updateAnswers();
  }

  function next() {
    if (state.view !== "question" || !state.answers[state.queue[state.step].id]) return;
    if (state.step === state.queue.length - 1) { showResults(); return; }
    state.step++;
    renderQuestion();
    $("question-text").focus();
  }

  function previous() {
    if (state.view !== "question" || state.step === 0) return;
    state.step--;
    renderQuestion();
    $("question-text").focus();
  }

  function sourceLink(source) {
    const link = make("a", "source-link", source.title);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function renderSources() {
    const list = $("sources-list");
    list.replaceChildren();
    list.appendChild(make("p", "source-updated", "質問・出典の見直し日：" + state.updatedAt.replaceAll("-", "/")));
    const groups = { government: "政府・公的機関の指針", standard: "公開基準・技術資料", vendor: "企業が公開した対策資料・攻撃調査" };
    Object.entries(groups).forEach(([kind, title]) => {
      const sources = state.sources.filter((source) => source.kind === kind);
      if (!sources.length) return;
      list.appendChild(make("h3", "source-group-title", title));
      const items = make("ul", "source-items");
      sources.forEach((source) => {
        const item = make("li", "source-item");
        item.append(sourceLink(source), make("span", "source-publisher", " — " + source.publisher));
        items.appendChild(item);
      });
      list.appendChild(items);
    });
  }

  function renderReferences(question, container) {
    container.replaceChildren();
    const list = make("ul", "reference-list");
    question.references.forEach((ref) => {
      const source = state.sources.find((entry) => entry.id === ref.sourceId);
      if (!source) return;
      const item = make("li", "reference-item");
      item.append(sourceLink(source), make("span", "reference-section", "参照箇所：" + ref.section));
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function renderAction(action, index, compact) {
    const { question: q, answer: value } = action;
    const unknown = value === "UNKNOWN";
    const item = make("article", (compact ? "priority-item" : "advice-item") + (unknown ? " is-unknown" : ""));
    if (compact) item.appendChild(make("span", "priority-number", String(index + 1).padStart(2, "0")));
    const body = compact ? make("div", "priority-body") : item;
    const meta = make("div", "advice-meta");
    meta.append(make("span", "advice-priority " + q.priority, priorityLabels[q.priority]), make("span", "answer-state", unknown ? "まず確認する" : "見直したい"));
    body.append(meta, make(compact ? "h4" : "h3", compact ? "priority-title" : "advice-title", q.adviceTitle));
    if (!compact) body.appendChild(make("p", "advice-question", q.question));
    if (unknown) body.appendChild(make("p", "unknown-note", "まず設定や担当者に確認しましょう。必要なら、次の対策を進めてください。"));
    body.appendChild(make("p", compact ? "priority-text" : "advice-text", q.adviceText));
    if (!compact) {
      const sources = make("div", "advice-sources");
      renderReferences(q, sources);
      body.appendChild(sources);
    }
    if (compact) item.appendChild(body);
    return item;
  }

  function showResults() {
    cancelAdvance();
    const summary = summarize(state.queue, state.answers);
    if (summary.answered !== state.queue.length) return;
    setText("result-title", laneLabels[state.lane] + "のチェック結果");
    setText("result-scope", assessmentLabels[state.scope] + "の結果");
    setText("result-coverage", state.scope === "quick"
      ? "40問のうち重要12問だけを確認した結果です。残り28問はこの結果に含まれません。"
      : "重要12問と追加28問を合わせた、40問の結果です。");
    toggle("continue-check", state.scope === "quick");
    setText("result-score", summary.confirmedPercent === null ? "—" : String(summary.confirmedPercent));
    const summaryText = summary.applicable === 0
      ? "今回は対象となる項目がありませんでした。使っている環境に合うコースでも確認できます。"
      : summary.actions.length === 0
        ? "今回の回答では、すべての対象項目が対策済みでした。設定や使い方が変わったときにも確かめてみましょう。"
        : "見直したい項目が" + summary.counts.NO + "件、まだ確認していない項目が" + summary.counts.UNKNOWN + "件ありました。まずは下の項目から、できることを一つずつ。";
    setText("result-summary", summaryText);
    const stats = $("result-stats");
    stats.replaceChildren();
    Object.entries(summary.counts).forEach(([key, count]) => {
      const card = make("div", "stat-card stat-" + key.toLowerCase());
      card.append(make("span", "stat-value", count + "件"), make("span", "stat-label", answerLabels[key]));
      stats.appendChild(card);
    });
    const priorities = $("priority-list");
    const advice = $("advice-list");
    priorities.replaceChildren();
    advice.replaceChildren();
    if (!summary.actions.length) {
      priorities.appendChild(make("p", "empty-state", "今の取り組みを続けながら、更新とバックアップを定期的に確かめましょう。"));
      advice.appendChild(make("p", "empty-state", "今回、見直し・未確認の項目はありません。回答に基づく結果であり、安全性の保証ではありません。"));
    } else {
      summary.actions.slice(0, 3).forEach((action, index) => priorities.appendChild(renderAction(action, index, true)));
      summary.actions.forEach((action, index) => advice.appendChild(renderAction(action, index, false)));
    }
    setText("report-status", "");
    toggle("report-fallback", false);
    showView("result", "result-title");
  }

  function continueFull() {
    if (state.view !== "result" || state.scope !== "quick" || summarize(state.queue, state.answers).answered !== 12) return;
    state.revision++;
    state.scope = "full";
    state.queue = selectQuestions(state.questions, state.lane, state.scope);
    state.step = 12;
    $("report-fallback").value = "";
    renderQuestion();
    showView("question", "question-text");
  }

  function report() { return buildReport(state.lane, summarize(state.queue, state.answers), state.updatedAt, state.scope, state.sources); }

  async function copyReport() {
    if (state.view !== "result") return;
    const revision = state.revision;
    const text = report();
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (state.revision !== revision || state.view !== "result") return;
      setText("report-status", "レポートをコピーしました。");
      toggle("report-fallback", false);
    } catch {
      if (state.revision !== revision || state.view !== "result") return;
      const field = $("report-fallback");
      field.value = text;
      toggle("report-fallback", true);
      field.focus();
      field.select();
      setText("report-status", "自動でコピーできなかったため、下のレポートを選択しました。手動でコピーするか、テキストで保存できます。");
    }
  }

  function downloadReport() {
    if (state.view !== "result") return;
    const url = URL.createObjectURL(new Blob(["\uFEFF", report()], { type: "text/plain;charset=utf-8" }));
    const link = make("a");
    link.href = url;
    link.download = "security-check-" + state.lane + "-" + state.scope + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setText("report-status", "レポートの保存を開始しました。");
  }

  function reset() {
    cancelAdvance();
    state.revision++;
    const dialog = $("reset-dialog");
    if (dialog.open) dialog.close();
    state.lane = null;
    state.scope = "quick";
    state.queue = [];
    state.answers = {};
    state.step = 0;
    $("report-fallback").value = "";
    ["result-stats", "priority-list", "advice-list"].forEach((id) => $(id).replaceChildren());
    ["question-text", "question-desc", "answer-feedback", "result-summary", "result-score", "report-status"].forEach((id) => setText(id, ""));
    showView("start");
    document.querySelector('[data-action="start"]')?.focus();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled || event.detail > 1) return;
    switch (button.dataset.action) {
      case "start": start(button.dataset.lane); break;
      case "start-challenge":
        state.revision++;
        cancelAdvance();
        showView("challenge");
        window.KnowledgeChallenge.start();
        break;
      case "answer": answer(button.dataset.answer); break;
      case "previous": previous(); break;
      case "return-results": if (state.view === "question") showResults(); break;
      case "continue-full": continueFull(); break;
      case "edit-answers":
        if (state.view !== "result") break;
        state.revision++;
        $("report-fallback").value = "";
        toggle("report-fallback", false);
        state.step = 0;
        renderQuestion();
        showView("question", "question-text");
        break;
      case "request-reset":
        if (state.view === "challenge") { window.KnowledgeChallenge.requestExit(); break; }
        cancelAdvance();
        if (state.view === "question") updateAnswers();
        if (!Object.keys(state.answers).length) reset();
        else $("reset-dialog").showModal();
        break;
      case "cancel-reset": $("reset-dialog").close(); break;
      case "confirm-reset": reset(); break;
      case "retry-load": loadQuestions(); break;
      case "copy-report": copyReport(); break;
      case "download-report": downloadReport(); break;
    }
  });
  document.addEventListener("challenge-exit", reset);
  document.addEventListener("DOMContentLoaded", loadQuestions);
})();
