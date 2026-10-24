(function () {
  "use strict";
  const engine = window.SecurityChallenge;
  const ADVANCE_DELAY = 320;
  const state = { data: null, queue: [], answers: {}, step: 0, phase: "idle", timer: null, locked: false, generation: 0, controller: null, confirming: false, result: null, sort: "mistakes" };
  const mount = () => document.getElementById("challenge-card");
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (label, action, className = "challenge-secondary") => {
    const element = make("button", "challenge-button " + className, label);
    element.type = "button";
    element.dataset.challengeAction = action;
    return element;
  };
  function focusTitle() { mount()?.querySelector(".challenge-title")?.focus(); }
  function cancelAdvance() {
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    state.locked = false;
  }
  function shell(title, eyebrow) {
    const container = mount();
    container.replaceChildren();
    const panel = make("div", "challenge-panel");
    const top = make("div", "challenge-topline");
    top.append(make("span", "challenge-kicker", "セキュリティエンジニア基礎"), button("ホームへ戻る", "exit", "challenge-link"));
    panel.appendChild(top);
    if (eyebrow) panel.appendChild(make("p", "challenge-eyebrow", eyebrow));
    const heading = make("h2", "challenge-title", title);
    heading.tabIndex = -1;
    panel.appendChild(heading);
    container.appendChild(panel);
    return panel;
  }
  function start() {
    if (!mount()) return;
    cancelAdvance();
    state.controller?.abort();
    state.generation++;
    const generation = state.generation;
    state.queue = [];
    state.answers = {};
    state.result = null;
    state.confirming = false;
    state.phase = "loading";
    const panel = shell("挑戦の準備をしています", "知識チャレンジ");
    const status = make("p", "challenge-description", "問題を読み込んでいます…");
    status.setAttribute("role", "status");
    panel.appendChild(status);
    focusTitle();
    const ready = state.data ? Promise.resolve(state.data) : loadData();
    ready.then(data => {
      if (generation !== state.generation) return;
      state.data = data;
      state.phase = "intro";
      renderIntro();
    }).catch(error => {
      if (generation !== state.generation || error.name === "AbortError") return;
      state.phase = "error";
      const errorPanel = shell("問題を読み込めませんでした", "もう一度お試しください");
      const message = make("p", "challenge-description", "問題データを確認できませんでした。ファイルを直接開いている場合は、HTTPで配信して利用してください。");
      message.setAttribute("role", "alert");
      errorPanel.append(message, button("もう一度読み込む", "reload", "challenge-primary"));
      focusTitle();
      console.error("知識テストの読み込みに失敗しました。", error);
    });
  }
  async function loadData() {
    state.controller = new AbortController();
    const response = await fetch("data/challenge.json", { credentials: "omit", cache: "no-cache", signal: state.controller.signal });
    if (!response.ok) throw new Error("Question data HTTP " + response.status);
    const data = await response.json();
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.updatedAt)) throw new Error("Missing content review date");
    engine.validateQuestions(data.questions);
    return data;
  }
  function renderIntro() {
    const panel = shell("基礎知識を、クエスト感覚で。", "20問の知識チャレンジ");
    panel.appendChild(make("p", "challenge-description", "ネットワークからWeb開発、運用と復旧まで。状況に合う対応を4つの選択肢から選び、基本の考え方を確かめましょう。"));
    const rules = make("div", "challenge-rules");
    [["20問", "4択・1問5点"], ["90点以上", "18問以上正解で合格"], ["10〜15分", "目安・時間制限なし"]].forEach(([value, label]) => {
      const card = make("div", "challenge-rule");
      card.append(make("strong", "challenge-rule-value", value), make("span", "challenge-rule-label", label));
      rules.appendChild(card);
    });
    panel.append(rules, make("p", "challenge-description", "答えを選ぶと約0.3秒で次へ進みます。前の問題へ戻って選び直せます。正解と解説は、20問すべてに答えた後で確認できます。"));
    const note = make("p", "challenge-note", "合格はこのアプリの学習用基準です。公式資格の認定や、実務能力・システムの安全性を保証するものではありません。");
    panel.append(note, button("チャレンジを始める →", "begin", "challenge-primary"), make("p", "challenge-privacy", "登録不要・回答の外部送信なし。ページを閉じると回答は消えます。"));
    focusTitle();
  }
  function begin() {
    if (!state.data || !["intro", "result"].includes(state.phase)) return;
    cancelAdvance();
    state.generation++;
    state.queue = engine.shuffleQuestions(state.data.questions);
    state.answers = {};
    state.step = 0;
    state.phase = "quiz";
    state.result = null;
    state.sort = "mistakes";
    state.confirming = false;
    renderQuestion();
  }
  function renderQuestion() {
    if (state.phase !== "quiz") return;
    cancelAdvance();
    const question = state.queue[state.step];
    const panel = shell(question.question, question.category);
    const progress = make("div", "challenge-progress");
    const progressText = make("div", "challenge-progress-text");
    const count = Object.keys(state.answers).length;
    progressText.append(make("span", "", "問題 " + (state.step + 1) + " / 20"), make("span", "", count + "問 回答済み"));
    const track = make("div", "challenge-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "知識テストの回答数");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "20");
    track.setAttribute("aria-valuenow", String(count));
    const fill = make("div", "challenge-progress-fill");
    fill.style.width = count / 20 * 100 + "%";
    track.appendChild(fill);
    progress.append(progressText, track);
    panel.querySelector(".challenge-eyebrow").before(progress);
    panel.appendChild(make("p", "challenge-help", "もっとも適切なものを1つ選んでください。"));
    const options = make("div", "challenge-options");
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", "4つの回答候補");
    question.options.forEach((option, index) => {
      const choice = button("", "answer", "challenge-option");
      choice.dataset.optionId = option.id;
      choice.setAttribute("aria-pressed", String(state.answers[question.id] === option.id));
      choice.append(make("span", "challenge-option-letter", String.fromCharCode(65 + index)), make("span", "challenge-option-text", option.text));
      options.appendChild(choice);
    });
    const status = make("p", "challenge-answer-status", state.answers[question.id] ? "回答済みです。選び直すと自動で次へ進みます。" : "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = make("div", "challenge-question-actions");
    const previous = button("← 前の問題", "previous");
    previous.disabled = state.step === 0;
    const next = button(state.step === 19 ? "採点する" : "次の問題 →", "next", "challenge-primary");
    next.disabled = !state.answers[question.id];
    actions.append(previous, next);
    panel.append(options, status, actions, make("p", "challenge-note", "1問5点・合格は90点以上。合否と得点は、全問回答後に表示します。"));
    focusTitle();
  }
  function selectAnswer(optionId) {
    if (state.phase !== "quiz" || state.locked || state.confirming) return;
    const question = state.queue[state.step];
    if (!question.options.some(option => option.id === optionId)) return;
    state.answers[question.id] = optionId;
    state.locked = true;
    mount().querySelectorAll('[data-challenge-action="answer"]').forEach(choice => {
      choice.setAttribute("aria-pressed", String(choice.dataset.optionId === optionId));
      choice.disabled = true;
    });
    const count = Object.keys(state.answers).length;
    mount().querySelector(".challenge-progress-text").lastElementChild.textContent = count + "問 回答済み";
    mount().querySelector(".challenge-progress-track").setAttribute("aria-valuenow", String(count));
    mount().querySelector(".challenge-progress-fill").style.width = count / 20 * 100 + "%";
    mount().querySelector(".challenge-answer-status").textContent = state.step === 19 ? "選択しました。全問の回答を確認して採点します。" : "選択しました。次の問題へ進みます。";
    mount().querySelector('[data-challenge-action="next"]').disabled = true;
    const generation = state.generation;
    const step = state.step;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (generation !== state.generation || state.phase !== "quiz" || state.confirming || step !== state.step) return;
      state.locked = false;
      advance();
    }, ADVANCE_DELAY);
  }
  function advance() {
    if (state.phase !== "quiz" || state.locked || state.confirming || !state.answers[state.queue[state.step].id]) return;
    cancelAdvance();
    if (state.step < 19) {
      state.step++;
      renderQuestion();
      return;
    }
    const result = engine.gradeAttempt(state.queue, state.answers);
    if (!result.complete) {
      state.step = state.queue.findIndex(question => !state.answers[question.id]);
      renderQuestion();
      return;
    }
    state.result = result;
    state.phase = "result";
    renderResult();
  }
  function previous() {
    if (state.phase !== "quiz" || state.confirming || state.step === 0) return;
    cancelAdvance();
    state.step--;
    renderQuestion();
  }
  function renderResult() {
    const result = state.result;
    if (!result?.complete) return;
    cancelAdvance();
    const panel = shell(result.passed ? "合格！ 基礎チャレンジ達成" : "不合格 — 復習して、もう一度。", "全20問の結果");
    const score = make("div", "challenge-score " + (result.passed ? "is-pass" : "is-fail"));
    const badge = make("strong", "challenge-result-badge", result.passed ? "合格" : "不合格");
    const number = make("div", "challenge-score-number");
    number.append(make("strong", "", String(result.score)), make("span", "", " / 100点"));
    score.append(badge, number, make("p", "challenge-score-detail", result.correctCount + " / 20問 正解・合格ライン 90点以上"));
    panel.append(score, make("p", "challenge-description", result.passed ? "18問以上に正解しました。誤答や迷った問題の解説を読み、基本を使える知識につなげましょう。" : "合格にはあと" + (18 - result.correctCount) + "問の正解が必要でした。間違えた問題から確認して、理解できたら新しい順番で再挑戦できます。"), make("p", "challenge-note", "この合否は、このアプリの学習用基準です。公式資格認定や実務能力・システムの安全性の保証ではありません。"));
    const actions = make("div", "challenge-result-actions");
    actions.append(button("新しい順番でもう一度挑戦", "retry", "challenge-primary"), button("ホームへ戻る", "exit"));
    panel.appendChild(actions);
    const categoryHeading = make("h3", "challenge-section-title", "分野ごとの振り返り");
    const categories = make("div", "challenge-categories");
    result.categories.forEach(category => {
      const row = make("div", "challenge-category-row");
      const labels = make("div", "challenge-category-labels");
      labels.append(make("span", "", category.category), make("strong", "", category.correct + " / " + category.total + "問"));
      const track = make("div", "challenge-category-track");
      const fill = make("div", "challenge-category-fill");
      fill.style.width = category.percent + "%";
      track.appendChild(fill);
      row.append(labels, track);
      categories.appendChild(row);
    });
    panel.append(categoryHeading, categories, make("h3", "challenge-section-title", "全問の解説で学び直す"));
    const sorts = make("div", "challenge-review-controls");
    [["mistakes", "誤答から見る"], ["category", "分野ごとに見る"]].forEach(([sort, label]) => {
      const control = button(label, "sort", "challenge-sort");
      control.dataset.sort = sort;
      control.setAttribute("aria-pressed", String(state.sort === sort));
      sorts.appendChild(control);
    });
    const reviews = make("div", "challenge-review-list");
    panel.append(sorts, reviews, make("p", "challenge-note", "問題と出典の確認日：" + state.data.updatedAt.replaceAll("-", "/") + "。参考リンクは外部サイトで開きます。"));
    renderReviews();
    focusTitle();
  }
  function renderReviews() {
    if (state.phase !== "result" || !state.result?.complete) return;
    const list = mount().querySelector(".challenge-review-list");
    list.replaceChildren();
    const rows = state.queue.map((question, index) => ({ question, index, result: state.result.results.find(result => result.questionId === question.id) }));
    const categoryOrder = state.result.categories.map(category => category.category);
    rows.sort((a, b) => (state.sort === "category" ? categoryOrder.indexOf(a.question.category) - categoryOrder.indexOf(b.question.category) : 0) || Number(a.result.correct) - Number(b.result.correct) || a.index - b.index);
    let lastCategory = null;
    rows.forEach(({ question, index, result }) => {
      if (state.sort === "category" && question.category !== lastCategory) {
        list.appendChild(make("h4", "challenge-review-category", question.category));
        lastCategory = question.category;
      }
      const article = make("article", "challenge-review " + (result.correct ? "is-correct" : "is-incorrect"));
      const meta = make("div", "challenge-review-meta");
      meta.append(make("span", "challenge-review-state", result.correct ? "正解" : "不正解"), make("span", "", "出題 " + (index + 1) + "・" + question.category));
      const selected = question.options.find(option => option.id === result.selectedOptionId);
      const correct = question.options.find(option => option.id === question.correctOptionId);
      const selection = make("p", "challenge-review-answer");
      selection.append(make("strong", "", "あなたの回答："), document.createTextNode(selected.text));
      const solution = make("p", "challenge-review-solution");
      solution.append(make("strong", "", "正解："), document.createTextNode(correct.text));
      article.append(meta, make("h4", "challenge-review-question", question.question), selection, solution, make("p", "challenge-review-explanation", question.explanation));
      const references = make("ul", "challenge-references");
      question.references.forEach(reference => {
        const item = make("li");
        const link = make("a", "", reference.title);
        link.href = reference.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(link, make("span", "", " — " + reference.publisher + " / " + reference.section));
        references.appendChild(item);
      });
      article.appendChild(references);
      list.appendChild(article);
    });
  }
  function hasProgress() { return Object.keys(state.answers).length > 0; }
  function reset() {
    cancelAdvance();
    state.controller?.abort();
    state.controller = null;
    state.generation++;
    state.queue = [];
    state.answers = {};
    state.step = 0;
    state.phase = "idle";
    state.confirming = false;
    state.result = null;
    mount()?.replaceChildren();
  }
  function exit() {
    reset();
    document.dispatchEvent(new CustomEvent("challenge-exit"));
  }
  function requestExit() {
    if (state.confirming) return;
    cancelAdvance();
    if (!hasProgress()) { exit(); return; }
    state.confirming = true;
    const dialog = make("dialog", "challenge-exit-dialog");
    dialog.setAttribute("aria-labelledby", "challenge-exit-title");
    dialog.setAttribute("aria-describedby", "challenge-exit-description");
    const title = make("h2", "", "ホームへ戻りますか？");
    title.id = "challenge-exit-title";
    const description = make("p", "", "この挑戦の回答と結果は消去されます。ホームへ戻った後は、新しい試験として始まります。");
    description.id = "challenge-exit-description";
    const actions = make("div", "challenge-dialog-actions");
    const cancel = button("挑戦を続ける", "cancel-exit");
    const confirm = button("ホームへ戻る", "confirm-exit", "challenge-primary");
    actions.append(cancel, confirm);
    dialog.append(title, description, actions);
    dialog.addEventListener("close", () => {
      state.confirming = false;
      dialog.remove();
      if (state.phase === "quiz") renderQuestion();
      else if (state.phase === "result") mount()?.querySelector('[data-challenge-action="exit"]')?.focus();
    });
    mount().appendChild(dialog);
    dialog.showModal();
    cancel.focus();
  }
  document.addEventListener("click", event => {
    const control = event.target.closest("[data-challenge-action]");
    if (!control || !mount()?.contains(control) || control.disabled || event.detail > 1) return;
    const action = control.dataset.challengeAction;
    if (state.confirming && !["cancel-exit", "confirm-exit"].includes(action)) return;
    switch (action) {
      case "begin": case "retry": begin(); break;
      case "reload": start(); break;
      case "answer": selectAnswer(control.dataset.optionId); break;
      case "next": advance(); break;
      case "previous": previous(); break;
      case "exit": requestExit(); break;
      case "cancel-exit": mount().querySelector(".challenge-exit-dialog")?.close(); break;
      case "confirm-exit": exit(); break;
      case "sort":
        if (state.phase !== "result" || !["mistakes", "category"].includes(control.dataset.sort)) break;
        state.sort = control.dataset.sort;
        mount().querySelectorAll('[data-challenge-action="sort"]').forEach(button => button.setAttribute("aria-pressed", String(button.dataset.sort === state.sort)));
        renderReviews();
        break;
    }
  });
  window.KnowledgeChallenge = Object.freeze({ start, reset, hasProgress, requestExit });
})();
