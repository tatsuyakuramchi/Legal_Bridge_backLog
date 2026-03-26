const state = {
  dashboard: null,
  templateDefinitions: []
};

const el = {
  title: document.getElementById("app-title"),
  health: document.getElementById("health-grid"),
  issues: document.getElementById("issues"),
  contracts: document.getElementById("contracts"),
  deliveries: document.getElementById("deliveries"),
  pollingLogs: document.getElementById("polling-logs"),
  documents: document.getElementById("documents"),
  events: document.getElementById("events"),
  issueCount: document.getElementById("issue-count"),
  configForm: document.getElementById("config-form"),
  templateForm: document.getElementById("template-form"),
  templateDefinitions: document.getElementById("template-definitions"),
  templateDefinitionCount: document.getElementById("template-definition-count"),
  backlogSetupChecklist: document.getElementById("backlog-setup-checklist"),
  runPoller: document.getElementById("run-poller"),
  runApprovalReminder: document.getElementById("run-approval-reminder"),
  runStampReminder: document.getElementById("run-stamp-reminder"),
  addSample: document.getElementById("add-sample"),
  testBacklog: document.getElementById("test-backlog"),
  testCloudSign: document.getElementById("test-cloudsign"),
  showBacklogSetup: document.getElementById("show-backlog-setup"),
  testSlack: document.getElementById("test-slack"),
  syncCloudSign: document.getElementById("sync-cloudsign"),
  validateTemplates: document.getElementById("validate-templates"),
  flash: document.getElementById("flash"),
  bulkOrderForm: document.getElementById("bulk-order-form"),
  bulkOrderFile: document.getElementById("bulk-order-file"),
  bulkOrderText: document.getElementById("bulk-order-text"),
  bulkOrderResult: document.getElementById("bulk-order-result")
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
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  return filePath.replace(/^.*[\\/]/, "/tmp/");
}

function renderBulkOrderResult(result) {
  if (!result) {
    el.bulkOrderResult.innerHTML = `<div class="stack-item"><div class="meta">まだ実行していません。</div></div>`;
    return;
  }

  const rows = result.rows
    .map((row) => {
      const link = row.pdfPath ? `<div class="meta"><a href="${fileHref(row.pdfPath)}" target="_blank" rel="noreferrer">PDFを開く</a></div>` : "";
      return `
        <div class="stack-item">
          <strong>Row ${row.rowNumber} / ${row.projectTitle || "-"}</strong>
          <div class="meta">${row.vendorName || "-"}</div>
          <div class="meta">status: ${row.status}</div>
          ${row.issueKey ? `<div class="meta">issue: ${row.issueKey}</div>` : ""}
          ${row.fileName ? `<div class="meta">${row.fileName}</div>` : ""}
          ${row.error ? `<div class="meta error-text">${row.error}</div>` : ""}
          ${link}
        </div>`;
    })
    .join("");

  const merged = result.mergedPdfPath
    ? `<div class="stack-item"><strong>${result.mergedFileName}</strong><div class="meta"><a href="${fileHref(result.mergedPdfPath)}" target="_blank" rel="noreferrer">合冊PDFを開く</a></div></div>`
    : "";

  el.bulkOrderResult.innerHTML = `
    <div class="stack-item">
      <strong>処理結果</strong>
      <div class="meta">rows: ${result.totalRows}</div>
      <div class="meta">success: ${result.successCount}</div>
      <div class="meta">error: ${result.errorCount}</div>
      <div class="meta">outputMode: ${result.outputMode}</div>
      <div class="meta">backlog create requested: ${result.backlogIssueCreationRequested}</div>
      <div class="meta">backlog create supported: ${result.backlogIssueCreationSupported}</div>
    </div>
    ${merged}
    ${rows || `<div class="stack-item"><div class="meta">対象行はありません。</div></div>`}
  `;
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
    : `<div class="stack-item"><div class="meta">Template定義はまだありません。</div></div>`;

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
          <button data-request-approval="${issue.id}" class="secondary">承認依頼</button>
          <button data-request-stamp="${issue.id}" class="secondary">押印依頼</button>
          <button data-cloudsign="${issue.id}" class="secondary">CloudSign送信</button>
          <button data-notify="${issue.id}" class="secondary">Slack通知</button>
        </div>
      </article>`
    )
    .join("");

  el.contracts.innerHTML = (dashboard.contracts || []).length
    ? dashboard.contracts
        .map(
          (contract) => `
      <div class="stack-item">
        <strong>${contract.contract_no}</strong>
        <div class="meta">${contract.issue_key} / ${contract.template_key}</div>
        <div class="meta">workflow: ${contract.workflow_status}</div>
        <div class="meta">approval: ${contract.approval_status || "-"}</div>
        <div class="meta">stamp: ${contract.stamp_status || "-"}</div>
      </div>`
        )
        .join("")
    : `<div class="stack-item"><div class="meta">契約台帳はまだありません。</div></div>`;

  el.deliveries.innerHTML = (dashboard.deliveries || []).length
    ? dashboard.deliveries
        .map(
          (delivery) => `
      <div class="stack-item">
        <strong>${delivery.issue_key}</strong>
        <div class="meta">${delivery.delivery_type}</div>
        <div class="meta">status: ${delivery.status}</div>
        <div class="meta">requested: ${new Date(delivery.requested_at).toLocaleString("ja-JP")}</div>
      </div>`
        )
        .join("")
    : `<div class="stack-item"><div class="meta">納品台帳はまだありません。</div></div>`;

  el.pollingLogs.innerHTML = (dashboard.pollingLogs || []).length
    ? dashboard.pollingLogs
        .map(
          (log) => `
      <div class="stack-item">
        <strong>${log.source}</strong>
        <div>${log.message}</div>
        <div class="meta">fetched=${log.fetched_count} created=${log.created_count} updated=${log.updated_count}</div>
        <div class="meta">${new Date(log.finished_at).toLocaleString("ja-JP")}</div>
      </div>`
        )
        .join("")
    : `<div class="stack-item"><div class="meta">ポーリングログはまだありません。</div></div>`;

  el.documents.innerHTML = dashboard.documents.length
    ? dashboard.documents
        .map(
          (doc) => `
      <div class="stack-item">
        <strong>${doc.fileName}</strong>
        <div class="meta">${doc.issueKey} / ${doc.templateKey}</div>
        <div class="meta"><a href="${fileHref(doc.driveFileUrl || doc.pdfPath)}" target="_blank" rel="noreferrer">${doc.driveFileUrl ? "Driveを開く" : "PDFを開く"}</a></div>
        ${doc.driveFolderUrl ? `<div class="meta"><a href="${fileHref(doc.driveFolderUrl)}" target="_blank" rel="noreferrer">Driveフォルダを開く</a></div>` : ""}
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

  for (const name of [
    "backlogSpace",
    "backlogProjectId",
    "driveRootFolderId",
    "pollingIntervalSec",
    "approverSlackId",
    "legalSlackChannel"
  ]) {
    const input = el.configForm.elements.namedItem(name);
    if (input) {
      input.value = dashboard.config[name] ?? "";
    }
  }

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

  document.querySelectorAll("[data-request-approval]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await fetchJson(`/api/issues/${button.dataset.requestApproval}/request-approval`, { method: "POST" });
        showFlash("承認依頼を送信しました。");
        await load();
      } catch (error) {
        showFlash(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-request-stamp]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await fetchJson(`/api/issues/${button.dataset.requestStamp}/request-stamp`, { method: "POST" });
        showFlash("押印依頼を送信しました。");
        await load();
      } catch (error) {
        showFlash(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-cloudsign]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await fetchJson(`/api/issues/${button.dataset.cloudsign}/cloudsign/send`, { method: "POST" });
        showFlash(`CloudSign送信: ${result.documentId}`);
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
    showFlash("Template definition を追加しました。");
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

el.runApprovalReminder.addEventListener("click", async () => {
  try {
    const result = await fetchJson("/api/approvals/remind", { method: "POST" });
    showFlash(`承認リマインド送信: ${result.reminded}件`);
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.runStampReminder.addEventListener("click", async () => {
  try {
    const result = await fetchJson("/api/stamps/remind", { method: "POST" });
    showFlash(`押印リマインド送信: ${result.reminded}件`);
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
    showFlash(`Template検証 ${passed}/${results.length} 件 OK`);
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.addSample.addEventListener("click", async () => {
  const payload = {
    title: "サンプル通知書のドラフト生成",
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

el.bulkOrderFile.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }
  el.bulkOrderText.value = await file.text();
});

el.bulkOrderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(el.bulkOrderForm);
  const csvText = String(formData.get("csvText") || "").trim();
  if (!csvText) {
    showFlash("CSV text is empty.", true);
    return;
  }

  const body = {
    csvText,
    outputMode: formData.get("outputMode"),
    previewOnly: formData.get("previewOnly") === "on",
    notifySlack: formData.get("notifySlack") === "on",
    createBacklogIssues: formData.get("createBacklogIssues") === "on"
  };

  try {
    const result = await fetchJson("/api/bulk-orders/import", {
      method: "POST",
      body: JSON.stringify(body)
    });
    renderBulkOrderResult(result);
    showFlash(
      body.previewOnly
        ? `Preview completed: ${result.totalRows} rows`
        : `Bulk order completed: ${result.successCount} success / ${result.errorCount} error`
    );
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.testCloudSign?.addEventListener("click", async () => {
  try {
    const result = await fetchJson("/api/integrations/cloudsign/test", { method: "POST" });
    showFlash(`CloudSign 接続OK: ${result.baseUrl}`);
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

el.syncCloudSign?.addEventListener("click", async () => {
  try {
    const result = await fetchJson("/api/cloudsign/sync", { method: "POST" });
    showFlash(`CloudSign同期: checked=${result.checked} completed=${result.completed} updated=${result.updated}`);
    await load();
  } catch (error) {
    showFlash(error.message, true);
  }
});

renderBulkOrderResult(null);
load().catch((error) => showFlash(error.message, true));
