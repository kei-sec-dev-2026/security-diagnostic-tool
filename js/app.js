// グローバル状態管理
let allQuestions = [];
let activeQueue = [];
let currentStep = 0;
let totalScore = 100;
let userAdvices = [];
let currentLane = "personal";

// 立場（レーン）の日本語ラベルマップ
const laneLabels = {
  personal: "個人ユーザー",
  admin: "企業・非エンジニア管理者",
  dev: "個人・AI開発者",
};

document.addEventListener("DOMContentLoaded", () => {
  loadQuestions();
});

// JSONの非同期読み込み
async function loadQuestions() {
  try {
    const response = await fetch("data/questions.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    allQuestions = await response.json();
  } catch (error) {
    console.error("質問データの読み込みに失敗しました:", error);
  }
}

// レーンの選択と診断開始
function selectLane(laneKey) {
  currentLane = laneKey;

  // 該当レーンの質問だけを抽出
  activeQueue = allQuestions.filter((q) => q.lane === laneKey);

  if (activeQueue.length === 0) {
    alert(
      "該当の質問が見つかりませんでした。questions.jsonを確認してください。",
    );
    return;
  }

  // 初期化
  currentStep = 0;
  totalScore = 100;
  userAdvices = [];

  // 画面の切り替え
  document.getElementById("lane-select-card").classList.add("hidden");
  document.getElementById("question-card").classList.remove("hidden");

  renderQuestion();
}

// 質問の表示
function renderQuestion() {
  if (currentStep >= activeQueue.length) {
    showResults();
    return;
  }

  const q = activeQueue[currentStep];

  // 進捗更新
  const progressPercent = Math.round((currentStep / activeQueue.length) * 100);
  document.getElementById("progress-percent").innerText = `${progressPercent}%`;
  document.getElementById("progress-bar-fill").style.width =
    `${progressPercent}%`;
  document.getElementById("progress-text").innerText =
    `質問 ${currentStep + 1} / ${activeQueue.length}`;

  // 質問カードのセット
  document.getElementById("question-category").innerText = q.category;
  document.getElementById("question-text").innerText = q.question;
  document.getElementById("question-desc").innerText = q.description;
}

// ユーザーの回答処理
function answerQuestion(answer) {
  const q = activeQueue[currentStep];

  // 減点およびアドバイス収集
  if (answer === q.deductPointsOn || (answer === "UNKNOWN" && q.points > 0)) {
    totalScore -= q.points;
    if (q.adviceTitle) {
      userAdvices.push({
        title: q.adviceTitle,
        text: q.adviceText,
        isHigh: q.points >= 20,
      });
    }
  }

  currentStep++;
  renderQuestion();
}

// 結果表示
function showResults() {
  document.getElementById("question-card").classList.add("hidden");
  document.getElementById("result-card").classList.remove("hidden");

  const finalScore = Math.max(0, totalScore);
  document.getElementById("result-score").innerText = finalScore;
  document.getElementById("result-title").innerText =
    `${laneLabels[currentLane]}向け 診断レポート`;

  const rankBadge = document.getElementById("result-rank");
  const summaryText = document.getElementById("result-summary");

  if (finalScore >= 85) {
    rankBadge.innerText = "ランク A （優良セキュア）";
    rankBadge.className = "rank-badge rank-A";
    summaryText.innerText =
      "素晴らしい安全意識です！この立場に必要なセキュリティ・プライバシー衛生が高水準に保たれています。";
  } else if (finalScore >= 60) {
    rankBadge.innerText = "ランク B （注意・改善余地あり）";
    rankBadge.className = "rank-badge rank-B";
    summaryText.innerText =
      "基本対策はできていますが、一部の運用・設定にリスクが潜んでいます。以下のアドバイスを確認してください。";
  } else {
    rankBadge.innerText = "ランク C （要警戒・危険）";
    rankBadge.className = "rank-badge rank-C";
    summaryText.innerText =
      "深刻な情報漏洩や攻撃を受ける直接的リスクが高い状態です。直ちにアドバイスのアクションを実施してください。";
  }

  // アドバイスの表示
  const adviceListEl = document.getElementById("advice-list");
  adviceListEl.innerHTML = "";

  if (userAdvices.length === 0) {
    adviceListEl.innerHTML = `<p style="color: #4ade80; font-size: 0.9rem;">🎉 重大なリスクは見つかりませんでした。この高い衛生基準を維持しましょう！</p>`;
  } else {
    userAdvices.forEach((item) => {
      const div = document.createElement("div");
      div.className = `advice-item ${item.isHigh ? "high" : ""}`;
      div.innerHTML = `
        <div class="advice-title">${item.title}</div>
        <div class="advice-text">${item.text}</div>
      `;
      adviceListEl.appendChild(div);
    });
  }
}

// 結果コピー
function copyReport() {
  const score = Math.max(0, totalScore);
  let text = `【セキュリティ衛生診断レポート (${laneLabels[currentLane]})】\n`;
  text += `安心度スコア: ${score}点 / 100点\n\n`;
  text += `■ 発見された注意点と改善アクション:\n`;

  if (userAdvices.length === 0) {
    text += `・特に問題となるリスクは見つかりませんでした。\n`;
  } else {
    userAdvices.forEach((item, index) => {
      text += `${index + 1}. ${item.title}\n   ${item.text}\n`;
    });
  }

  text += `\n※本診断はブラウザ内（ローカル）でのみ処理されています。`;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert("診断レポートをクリップボードにコピーしました！");
    })
    .catch((err) => {
      console.error("コピー失敗:", err);
    });
}

// 再度選択画面へ
function restartDiagnostic() {
  document.getElementById("result-card").classList.add("hidden");
  document.getElementById("lane-select-card").classList.remove("hidden");
}
