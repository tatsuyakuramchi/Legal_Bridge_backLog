const state = {
  dashboard: null
};

const el = {
  title: document.getElementById("app-title"),
  health: document.getElementById("health-grid"),
  issues: document.getElementById("issues"),
  documents: document.getElementById("documents"),
  events: document.getElementById("events"),
  issueCount: document.getElementById("issue-count"),
  configForm: document.getElementById("config-form"),
  runPoller: document.getElementById("run-poller"),
  addSample: document.getElementById("add-sample"),
  testBacklog: document.getElementById("test-backlog"),
  testSlack: document.getElementById("test-slack"),
  flash: document.getElementById("flash")
};

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body.message ?? text);
  }
  return body;
}

function showFlash(message, isError = false) {
  el.flash.textContent = message;
  el.flash.className = isError ? "flash flash-error" : "flash flash-ok";
}

function healthClass(level) {
  return `status-${level}`;
}

function fileHref(filePath) {
  return filePath.replace(/^.*[\\/]/, "/tmp/");
}

function render() {
  const dashboard = state.dashboard;
  if (!dashboard) return;

  el.title.textContent = dashboard.config.appTitle;
  el.issueCount.textContent = `${dashboard.issues.length}件`;
  el.health.innerHTML = Object.entries(dashboard.health)
    .map(
      ([key, value]) => `
      <div class="health-card">
        <div class="meta">${key.toUpperCase()}</div>
        <strong class="${healthClass(value)}">${value}</strong>
      </div>`
    )
    .join("");

  el.issues.innerHTML = dashboard.issues
    .map(
      (issue) => `
      <article class="issue-card">
        <header>
          <div>
            <div class="meta">${issue.issueKey}</div>
            <strong>${issue.title}</strong>
          </div>
          <span class="badge">${issue.status}</span>
        </header>
        <div class="meta">template: ${issue.templateKey}</div>
        <div class="meta">requester: ${issue.requester}</div>
        <div class="inline-actions">
          <button data-generate="${issue.id}">文書生成</button>
          <button data-notify="${issue.id}" class="secondary">Slack通知</button>
        </div>
      </article>`
    )
    .join("");

  el.documents.innerHTML = dashboard.documents.length
    ? dashboard.documents
        .map(
          (doc) => `
      <div class="stack-item">
        <strong>${doc.fileName}</strong>
        <div class="meta">${doc.issueKey} / ${doc.templateKey}</div>
        <div class="meta"><a href="${fileHref(doc.pdfPath)}" target="_blank" rel="noreferrer">PDFを開く</a></div>
        <div class="meta"><a href="${fileHref(doc.htmlPath)}" target="_blank" rel="noreferrer">HTMLを開く</a></div>
      </div>`
        )
        .join("")
    : `<div class="stack-item"><div class="meta">まだ文書は生成されていません。</div></div>`;

  el.events.innerHTML = dashboard.events
    .map(
      (event) => `
    <div class="stack-item">
      <strong>${event.type}</strong>
      <div>${event.message}</div>
      <div class="meta">${new Date(event.createdAt).toLocaleString("ja-JP")}</div>
    </div>`
    )
    .join("");

  [
    "backlogSpace",
    "backlogProjectId",
    "driveRootFolderId",
    "pollingIntervalSec",
    "approverSlackId",
    "legalSlackChannel"
  ].forEach((name) => {
    const input = el.configForm.elements.namedItem(name);
    if (input) {
      input.value = dashboard.config[name] ?? "";
    }
  });

  document.querySelectorAll("[data-generate]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await fetchJson(`/api/issues/${button.dataset.generate}/generate`, { method: "POST" });
        showFlash("文書を生成しました。");
        await load();
      } catch (error) {
        showFlash(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-notify]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await fetchJson(`/api/issues/${button.dataset.notify}/notify`, { method: "POST" });
        showFlash("Slack 通知を送信しました。");
        await load();
      } catch (error) {
        showFlash(error.message, true);
      }
    });
  });
}

async function load() {
  state.dashboard = await fetchJson("/api/dashboard");
  render();
}

el.configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(el.configForm);
  const body = Object.fromEntries(formData.entries());
  try {
    await fetchJson("/api/config", { method: "POST", body: JSON.stringify(body) });
    showFlash("設定を保存しました。");
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.runPoller.addEventListener("click", async () => {
  try {
    await fetchJson("/api/poller/run", { method: "POST" });
    showFlash("ポーリングを実行しました。");
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.testBacklog.addEventListener("click", async () => {
  try {
    const result = await fetchJson("/api/integrations/backlog/test", { method: "POST" });
    showFlash(`Backlog 接続OK: ${result.projectName}`);
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.testSlack.addEventListener("click", async () => {
  try {
    const result = await fetchJson("/api/integrations/slack/test", { method: "POST" });
    showFlash(`Slack 接続OK: ${result.channel}`);
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.addSample.addEventListener("click", async () => {
  const payload = {
    title: "支払通知書のドラフト生成",
    templateKey: "template_payment_notice",
    payload: {
      vendorName: "株式会社ビジョン",
      amountExcludingTax: "480000",
      paymentDate: "2026-03-31",
      approver_name: "法務部 承認者"
    }
  };

  try {
    await fetchJson("/api/issues", { method: "POST", body: JSON.stringify(payload) });
    showFlash("サンプル課題を追加しました。");
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

load().catch((error) => showFlash(error.message, true));
