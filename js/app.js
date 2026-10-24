// グローバル状態管理
let masterQuestions = [];
let activeQueue = [];
let currentStep = 0;
let totalScore = 100;
let userAdvices = [];

// DOM要素の読み込み
document.addEventListener("DOMContentLoaded", () => {
  loadQuestions();
});

// JSONファイルの非同期読み込み（パターンB: data/フォルダ指定）
async function loadQuestions() {
  try {
    const response = await fetch("data/questions.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    masterQuestions = await response.json();
    initDiagnostic();
  } catch (error) {
    console.error("質問データの読み込みに失敗しました:", error);
    document.getElementById("question-text").innerText = "エラー: data/questions.json の読み込みに失敗しました。パスやローカルサーバーの環境をご確認ください。";
  }
}

// 診断の初期化
function initDiagnostic() {
  activeQueue = [...masterQuestions];
  currentStep = 0;
  totalScore = 100;
  userAdvices = [];
  renderQuestion();
}

// 質問のレンダリング
function renderQuestion() {
  if (currentStep >= activeQueue.length) {
    showResults();
    return;
  }

  const q = activeQueue[currentStep];
  
  // 進捗状況の更新
  const progressPercent = Math.round((currentStep / activeQueue.length) * 100);
  document.getElementById("progress-percent").innerText = `${progressPercent}%`;
  document.getElementById("progress-bar-fill").style.width = `${progressPercent}%`;
  document.getElementById("progress-text").innerText = `質問 ${currentStep + 1} / ${activeQueue.length}`;

  // カード内容の挿入
  document.getElementById("question-category").innerText = q.category;
  document.getElementById("question-text").innerText = q.question;
  document.getElementById("question-desc").innerText = q.description;
}

// ユーザーの回答処理
function answerQuestion(answer) {
  const q = activeQueue[currentStep];

  // 1. 減点とアドバイスの判定
  if (answer === q.deductPointsOn || (answer === "UNKNOWN" && q.points > 0)) {
    totalScore -= q.points;
    if (q.adviceTitle) {
      userAdvices.push({
        title: q.adviceTitle,
        text: q.adviceText,
        isHigh: q.points >= 20
      });
    }
  }

  // 2. 連鎖質問（subQuestions）の動的差し込みトリガー
  if (q.triggerSubOn && answer === q.triggerSubOn && q.subQuestions && q.subQuestions.length > 0) {
    activeQueue.splice(currentStep + 1, 0, ...q.subQuestions);
  }

  // 次の質問へ
  currentStep++;
  renderQuestion();
}

// 結果画面の表示
function showResults() {
  document.getElementById("question-card").classList.add("hidden");
  document.getElementById("result-card").classList.remove("hidden");

  // スコアの丸め込み（0〜100点）
  const finalScore = Math.max(0, totalScore);
  document.getElementById("result-score").innerText = finalScore;

  // ランク付けと要約テキスト
  const rankBadge = document.getElementById("result-rank");
  const summaryText = document.getElementById("result-summary");

  if (finalScore >= 85) {
    rankBadge.innerText = "ランク A （優良セキュア）";
    rankBadge.className = "rank-badge rank-A";
    summaryText.innerText = "素晴らしいセキュリティ衛生意識です！個人情報の管理や退会後のデータ消去に対するリテラシーが高く保たれています。";
  } else if (finalScore >= 60) {
    rankBadge.innerText = "ランク B （注意・改善余地あり）";
    rankBadge.className = "rank-badge rank-B";
    summaryText.innerText = "基本的な安全意識はありますが、一部の決済情報の扱いや放置アカウント等にリスクが潜んでいます。アドバイスを確認しましょう。";
  } else {
    rankBadge.innerText = "ランク C （要警戒・危険）";
    rankBadge.className = "rank-badge rank-C";
    summaryText.innerText = "個人情報の漏洩やアカウント乗っ取りの直接的なリスクが高い状態です。下のアドバイスを確認して直ちに対策を講じてください。";
  }

  // アドバイス一覧のレンダリング
  const adviceListEl = document.getElementById("advice-list");
  adviceListEl.innerHTML = "";

  if (userAdvices.length === 0) {
    adviceListEl.innerHTML = `<p style="color: #4ade80; font-size: 0.9rem;">🎉 特別な注意点やリスクは見つかりませんでした。この調子で安全なデジタル生活を維持しましょう！</p>`;
  } else {
    userAdvices.forEach(item => {
      const div = document.createElement("div");
      div.className = `advice-item ${item.isHigh ? 'high' : ''}`;
      div.innerHTML = `
        <div class="advice-title">${item.title}</div>
        <div class="advice-text">${item.text}</div>
      `;
      adviceListEl.appendChild(div);
    });
  }
}

// レポートのコピー機能
function copyReport() {
  const score = Math.max(0, totalScore);
  let text = `【セキュリティ & データ衛生診断レポート（個人向け）】\n`;
  text += `安心度スコア: ${score}点 / 100点\n\n`;
  text += `■ 発見された注意点と改善アクション:\n`;

  if (userAdvices.length === 0) {
    text += `・特に問題となるリスクは見つかりませんでした。\n`;
  } else {
    userAdvices.forEach((item, index) => {
      text += `${index + 1}. ${item.title}\n   ${item.text}\n`;
    });
  }
  
  text += `\n※この診断はブラウザ内（ローカル）でのみ処理されています。`;

  navigator.clipboard.writeText(text).then(() => {
    alert("診断レポートをクリップボードにコピーしました！");
  }).catch(err => {
    console.error("コピーに失敗しました:", err);
  });
}

// 診断のリセット
function restartDiagnostic() {
  document.getElementById("result-card").classList.add("hidden");
  document.getElementById("question-card").classList.remove("hidden");
  initDiagnostic();
}