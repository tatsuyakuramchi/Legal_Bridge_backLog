const state = {
  dashboard: null,
  templateDefinitions: []
};

const el = {
  title: document.getElementById("app-title"),
  health: document.getElementById("health-grid"),
  issues: document.getElementById("issues"),
  documents: document.getElementById("documents"),
  events: document.getElementById("events"),
  issueCount: document.getElementById("issue-count"),
  configForm: document.getElementById("config-form"),
  templateForm: document.getElementById("template-form"),
  templateDefinitions: document.getElementById("template-definitions"),
  templateDefinitionCount: document.getElementById("template-definition-count"),
  backlogSetupChecklist: document.getElementById("backlog-setup-checklist"),
  runPoller: document.getElementById("run-poller"),
  addSample: document.getElementById("add-sample"),
  testBacklog: document.getElementById("test-backlog"),
  showBacklogSetup: document.getElementById("show-backlog-setup"),
  testSlack: document.getElementById("test-slack"),
  validateTemplates: document.getElementById("validate-templates"),
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
  el.templateDefinitionCount.textContent = `${state.templateDefinitions.length}件`;
  el.health.innerHTML = Object.entries(dashboard.health)
    .map(
      ([key, value]) => `
      <div class="health-card">
        <div class="meta">${key.toUpperCase()}</div>
        <strong class="${healthClass(value)}">${value}</strong>
      </div>`
    )
    .join("");

  el.templateDefinitions.innerHTML = state.templateDefinitions.length
    ? state.templateDefinitions
        .map(
          (definition) => `
      <article class="issue-card">
        <header>
          <div>
            <div class="meta">${definition.id}</div>
            <strong>${definition.documentName}</strong>
          </div>
          <span class="badge">${definition.contractNoPrefix}</span>
        </header>
        <div class="meta">${definition.templateFile}</div>
        <div class="meta">variables: ${definition.variables.length}</div>
        <div class="meta">issueTypes: ${(definition.issueTypes || []).join(", ")}</div>
      </article>`
        )
        .join("")
    : `<div class="stack-item"><div class="meta">テンプレート定義はまだありません。</div></div>`;

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
  const [dashboard, definitions, checklist] = await Promise.all([
    fetchJson("/api/dashboard"),
    fetchJson("/api/template-definitions"),
    fetch("/api/backlog-setup/checklist").then((response) => response.text())
  ]);
  state.dashboard = dashboard;
  state.templateDefinitions = definitions;
  el.backlogSetupChecklist.textContent = checklist;
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

el.templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(el.templateForm);
  const body = Object.fromEntries(formData.entries());
  body.issueTypes = String(body.issueTypes || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  try {
    await fetchJson("/api/template-definitions", { method: "POST", body: JSON.stringify(body) });
    showFlash("テンプレート定義を追加しました。");
    el.templateForm.reset();
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

el.showBacklogSetup.addEventListener("click", async () => {
  try {
    el.backlogSetupChecklist.textContent = await fetch("/api/backlog-setup/checklist").then((response) =>
      response.text()
    );
    showFlash("Backlog 設定チェックリストを更新しました。");
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

el.validateTemplates.addEventListener("click", async () => {
  try {
    const results = await fetchJson("/api/template-definitions/validate", { method: "POST" });
    const passed = results.filter((result) => result.passed).length;
    showFlash(`Template検証完了: ${passed}/${results.length} 件成功`);
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
