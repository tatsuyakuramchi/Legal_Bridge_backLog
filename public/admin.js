const state = {
  view: "dashboard",
  dashboard: null,
  users: [],
  partners: [],
  ledgerTerms: [],
  filteredUsers: [],
  filteredPartners: [],
  activeUser: null,
  editingPartnerId: null
};

const el = {
  title: document.getElementById("admin-title"),
  subtitle: document.getElementById("admin-subtitle"),
  flash: document.getElementById("admin-flash"),
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  views: {
    dashboard: document.getElementById("view-dashboard"),
    users: document.getElementById("view-users"),
    partners: document.getElementById("view-partners"),
    licenseLedger: document.getElementById("view-licenseLedger")
  },
  dashboardStats: document.getElementById("dashboard-stats"),
  dashboardLogs: document.getElementById("dashboard-logs"),
  dashboardAlerts: document.getElementById("dashboard-alerts"),
  usersSearch: document.getElementById("users-search"),
  usersSync: document.getElementById("users-sync"),
  usersTable: document.getElementById("users-table"),
  userDetail: document.getElementById("user-detail"),
  partnersSearch: document.getElementById("partners-search"),
  partnersExport: document.getElementById("partners-export"),
  partnersTable: document.getElementById("partners-table"),
  partnerForm: document.getElementById("partner-form"),
  partnerReset: document.getElementById("partner-reset"),
  partnersImportFile: document.getElementById("partners-import-file"),
  partnersImportText: document.getElementById("partners-import-text"),
  partnersImport: document.getElementById("partners-import"),
  partnersImportResult: document.getElementById("partners-import-result"),
  ledgerContractSearch: document.getElementById("ledger-contract-search"),
  ledgerContractLoad: document.getElementById("ledger-contract-load"),
  ledgerContractNo: document.getElementById("ledger-contract-no"),
  ledgerTermsForm: document.getElementById("ledger-terms-form"),
  ledgerTermsResult: document.getElementById("ledger-terms-result")
};

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? text);
  }
  return body;
}

function showFlash(message, type = "ok") {
  el.flash.textContent = message;
  el.flash.className = `admin-flash ${type}`;
}

function setView(view) {
  state.view = view;
  for (const [key, node] of Object.entries(el.views)) {
    node.classList.toggle("is-active", key === view);
  }
  for (const button of el.navItems) {
    button.classList.toggle("is-active", button.dataset.view === view);
  }
  const titles = {
    dashboard: ["ダッシュボード", "Admin Console の概況"],
    users: ["ユーザー管理", "Slack同期と権限管理"],
    partners: ["取引先マスタ", "登録 / 編集 / CSV取込"],
    licenseLedger: ["台帳金銭条件", "ライセンス台帳の金銭条件管理"]
  };
  el.title.textContent = titles[view][0];
  el.subtitle.textContent = titles[view][1];
}

function badge(label, color) {
  return `<span class="badge ${color}">${label}</span>`;
}

function renderDashboard() {
  const data = state.dashboard;
  if (!data) return;

  const stats = [
    ["ユーザー", data.usersCount, `有効 ${data.activeUsersCount}`],
    ["取引先", data.partnersCount, `有効 ${data.activePartnersCount}`],
    ["法務責任者", data.legalApproverCount, "承認経路候補"],
    ["最近の文書", data.recentDocumentsCount, "直近30件"]
  ];
  const colors = ["var(--blue)", "var(--gold)", "var(--green)", "var(--text-mid)"];

  el.dashboardStats.innerHTML = stats
    .map(
      ([label, value, sub], index) => `
        <div class="stat-card">
          <div class="kicker">${label}</div>
          <div class="value" style="color:${colors[index]}">${value}</div>
          <div class="sub">${sub}</div>
        </div>`
    )
    .join("");

  el.dashboardLogs.innerHTML = data.recentLogs
    .map(
      (log) => `
        <div class="stack-item">
          <div class="muted">${log.time}</div>
          <div>${log.text}</div>
          <div class="muted">${log.success ? "success" : "error"}</div>
        </div>`
    )
    .join("");

  el.dashboardAlerts.innerHTML = data.pendingAlerts
    .map(
      (alert) => `
        <div class="stack-item">
          <div>${alert.label}</div>
          <div class="muted">${alert.date}</div>
          <div>${badge(`${alert.days}日`, alert.level === "alert" ? "red" : alert.level === "warn" ? "amber" : "blue")}</div>
        </div>`
    )
    .join("");
}

function applyUserFilter() {
  const keyword = el.usersSearch.value.trim().toLowerCase();
  state.filteredUsers = state.users.filter((user) =>
    !keyword ||
    [user.name, user.department, user.title, user.slack_id, user.google_email, user.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
}

function renderUsers() {
  applyUserFilter();
  el.usersTable.innerHTML = state.filteredUsers
    .map(
      (user) => `
        <tr data-user-id="${user.id}">
          <td>
            <div>${user.name}</div>
            <div class="muted">${user.department} / ${user.title}</div>
          </td>
          <td class="mono">${user.slack_id}</td>
          <td>
            <div>${user.google_email || "<span class='muted'>-</span>"}</div>
            <div class="muted">${user.phone || "-"}</div>
          </td>
          <td>
            ${user.is_legal_approver ? badge("法務責任者", "gold") : ""}
            ${user.is_business_approver ? badge("事業部責任者", "blue") : ""}
            ${user.is_legal_staff ? badge("法務担当", "green") : ""}
            ${user.is_admin ? badge("管理者", "gray") : ""}
          </td>
          <td>${user.notify_via_dm ? "DM" : `CH ${user.notification_channel ?? ""}`}</td>
          <td>${badge(user.is_active ? "有効" : "無効", user.is_active ? "green" : "red")}</td>
        </tr>`
    )
    .join("");

  document.querySelectorAll("[data-user-id]").forEach((row) => {
    row.addEventListener("click", async () => {
      const user = await fetchJson(`/api/admin/users/${row.dataset.userId}`);
      state.activeUser = user;
      renderUserDetail();
    });
  });
}

function renderUserDetail() {
  const user = state.activeUser;
  if (!user) {
    el.userDetail.classList.add("is-hidden");
    el.userDetail.innerHTML = "";
    return;
  }

  el.userDetail.classList.remove("is-hidden");
  el.userDetail.innerHTML = `
    <h2>${user.name}</h2>
    <div class="detail-grid">
      <div class="stack-item"><div class="muted">部署</div><div>${user.department}</div></div>
      <div class="stack-item"><div class="muted">役職</div><div>${user.title}</div></div>
      <div class="stack-item"><div class="muted">Slack ID</div><div class="mono">${user.slack_id}</div></div>
      <div class="stack-item"><div class="muted">Google Email</div><div>${user.google_email}</div></div>
      <div class="stack-item"><div class="muted">電話番号</div><div>${user.phone || "-"}</div></div>
    </div>
    <form id="user-detail-form" class="form-grid" style="margin-top:16px;">
      <label><span>氏名</span><input name="name" value="${user.name}" /></label>
      <label><span>部署</span><input name="department" value="${user.department}" /></label>
      <label><span>役職</span><input name="title" value="${user.title}" /></label>
      <label><span>Slack ID</span><input name="slack_id" value="${user.slack_id}" /></label>
      <label><span>Google Email</span><input name="google_email" value="${user.google_email}" /></label>
      <label><span>電話番号</span><input name="phone" value="${user.phone || ""}" /></label>
      <label><span>法務責任者</span><select name="is_legal_approver"><option value="true"${user.is_legal_approver ? " selected" : ""}>ON</option><option value="false"${!user.is_legal_approver ? " selected" : ""}>OFF</option></select></label>
      <label><span>事業部責任者</span><select name="is_business_approver"><option value="true"${user.is_business_approver ? " selected" : ""}>ON</option><option value="false"${!user.is_business_approver ? " selected" : ""}>OFF</option></select></label>
      <label><span>法務担当</span><select name="is_legal_staff"><option value="true"${user.is_legal_staff ? " selected" : ""}>ON</option><option value="false"${!user.is_legal_staff ? " selected" : ""}>OFF</option></select></label>
      <label><span>システム管理者</span><select name="is_admin"><option value="true"${user.is_admin ? " selected" : ""}>ON</option><option value="false"${!user.is_admin ? " selected" : ""}>OFF</option></select></label>
      <label><span>有効フラグ</span><select name="is_active"><option value="true"${user.is_active ? " selected" : ""}>有効</option><option value="false"${!user.is_active ? " selected" : ""}>無効</option></select></label>
      <label><span>通知方式</span><select name="notify_via_dm"><option value="true"${user.notify_via_dm ? " selected" : ""}>DM</option><option value="false"${!user.notify_via_dm ? " selected" : ""}>チャンネル</option></select></label>
      <label><span>通知チャンネル</span><input name="notification_channel" value="${user.notification_channel ?? ""}" /></label>
      <label class="wide"><span>備考</span><textarea name="notes" rows="4">${user.notes ?? ""}</textarea></label>
      <div class="form-actions">
        <button type="submit" class="primary-button">保存</button>
      </div>
    </form>
  `;

  document.getElementById("user-detail-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const body = Object.fromEntries(formData.entries());
    for (const key of ["is_legal_approver", "is_business_approver", "is_legal_staff", "is_admin", "is_active", "notify_via_dm"]) {
      body[key] = body[key] === "true";
    }
    const updated = await fetchJson(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    state.activeUser = updated;
    state.users = state.users.map((item) => (item.id === updated.id ? updated : item));
    renderUsers();
    renderUserDetail();
    showFlash(`${updated.name} を更新しました。`);
  });
}

function applyPartnerFilter() {
  const keyword = el.partnersSearch.value.trim().toLowerCase();
  state.filteredPartners = state.partners.filter((partner) =>
    !keyword ||
    [partner.partner_code, partner.name, partner.name_kana, partner.contact_person]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
}

function renderPartners() {
  applyPartnerFilter();
  el.partnersTable.innerHTML = state.filteredPartners
    .map(
      (partner) => `
        <tr data-partner-id="${partner.id}">
          <td class="mono">${partner.partner_code}</td>
          <td>${partner.name}</td>
          <td>${badge(partner.is_corporation ? "法人" : "個人", partner.is_corporation ? "blue" : "green")}</td>
          <td>${partner.contact_person ?? "<span class='muted'>-</span>"}</td>
          <td>${partner.invoice_registration_number || "<span class='muted'>未登録</span>"}</td>
          <td>${badge(partner.is_active ? "有効" : "無効", partner.is_active ? "green" : "red")}</td>
        </tr>`
    )
    .join("");

  document.querySelectorAll("[data-partner-id]").forEach((row) => {
    row.addEventListener("click", async () => {
      const partner = await fetchJson(`/api/admin/partners/${row.dataset.partnerId}`);
      state.editingPartnerId = partner.id;
      fillPartnerForm(partner);
    });
  });
}

function fillPartnerForm(partner) {
  const form = el.partnerForm;
  for (const [key, value] of Object.entries(partner)) {
    const input = form.elements.namedItem(key);
    if (input) {
      input.value = value ?? "";
    }
  }
}

function resetPartnerForm() {
  state.editingPartnerId = null;
  el.partnerForm.reset();
  el.partnerForm.elements.namedItem("is_corporation").value = "true";
  el.partnerForm.elements.namedItem("is_invoice_issuer").value = "true";
  el.partnerForm.elements.namedItem("is_active").value = "true";
}

function renderImportResult(result) {
  if (!result) {
    el.partnersImportResult.innerHTML = "";
    return;
  }
  el.partnersImportResult.innerHTML = `
    <div class="stack-item">
      <div>imported: ${result.imported}</div>
      <div>skipped: ${result.skipped}</div>
      ${(result.errors || []).map((error) => `<div class="muted">${error}</div>`).join("")}
    </div>`;
}

function emptyLedgerTerm(termOrder) {
  return {
    contract_no: "",
    term_order: termOrder,
    heading: "",
    region: "",
    language: "",
    region_language_label: "",
    base_price_label: "",
    calc_method: "",
    rate: "",
    share_rate: "",
    calc_period: "",
    mg_ag: "",
    payment_terms: "",
    formula: "",
    formula_note: "",
    summary: "",
    note: "",
    currency: ""
  };
}

function fillLedgerTermsForm(contractNo, terms) {
  el.ledgerContractNo.value = contractNo || "";
  const byOrder = new Map((terms || []).map((term) => [Number(term.term_order), term]));
  for (const termOrder of [1, 2, 3]) {
    const term = { ...emptyLedgerTerm(termOrder), ...(byOrder.get(termOrder) || {}) };
    const mapping = {
      heading: `term${termOrder}_heading`,
      region: `term${termOrder}_region`,
      language: `term${termOrder}_language`,
      region_language_label: `term${termOrder}_region_language_label`,
      base_price_label: `term${termOrder}_base_price_label`,
      calc_method: `term${termOrder}_calc_method`,
      rate: `term${termOrder}_rate`,
      share_rate: `term${termOrder}_share_rate`,
      calc_period: `term${termOrder}_calc_period`,
      mg_ag: `term${termOrder}_mg_ag`,
      payment_terms: `term${termOrder}_payment_terms`,
      formula: `term${termOrder}_formula`,
      formula_note: `term${termOrder}_formula_note`,
      summary: `term${termOrder}_summary`,
      note: `term${termOrder}_note`,
      currency: `term${termOrder}_currency`
    };
    for (const [key, inputName] of Object.entries(mapping)) {
      el.ledgerTermsForm.elements.namedItem(inputName).value = term[key] ?? "";
    }
  }
}

function renderLedgerTermsResult(terms) {
  if (!terms || !terms.length) {
    el.ledgerTermsResult.innerHTML = "<div class='stack-item'><div class='muted'>保存済み金銭条件はありません。</div></div>";
    return;
  }
  el.ledgerTermsResult.innerHTML = terms
    .map(
      (term) => `
        <div class="stack-item">
          <div><strong>金銭条件${term.term_order}</strong></div>
          <div class="muted">${term.contract_no}</div>
          <div>${term.heading || term.region_language_label || term.calc_method || "-"}</div>
        </div>`
    )
    .join("");
}

async function loadLicenseLedgerTerms(contractNo) {
  const query = contractNo ? `?contractNo=${encodeURIComponent(contractNo)}` : "";
  const result = await fetchJson(`/api/admin/license-ledger-terms${query}`);
  state.ledgerTerms = result.terms ?? [];
  fillLedgerTermsForm(contractNo, state.ledgerTerms);
  renderLedgerTermsResult(state.ledgerTerms);
}

async function loadDashboard() {
  state.dashboard = await fetchJson("/api/admin/dashboard");
  renderDashboard();
}

async function loadUsers() {
  const result = await fetchJson("/api/admin/users");
  state.users = result.users ?? [];
  renderUsers();
}

async function loadPartners() {
  const result = await fetchJson("/api/admin/partners");
  state.partners = result.partners ?? [];
  renderPartners();
}

async function init() {
  await Promise.all([loadDashboard(), loadUsers(), loadPartners()]);
  setView("dashboard");
  fillLedgerTermsForm("", []);
  renderLedgerTermsResult([]);
}

el.navItems.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

el.usersSearch.addEventListener("input", renderUsers);
el.partnersSearch.addEventListener("input", renderPartners);

el.usersSync.addEventListener("click", async () => {
  const result = await fetchJson("/api/admin/users/sync", { method: "POST" });
  state.users = result.users ?? [];
  renderUsers();
  showFlash(`ユーザー同期を実行しました。mode=${result.mode} count=${result.count}`);
});

el.partnerReset.addEventListener("click", () => resetPartnerForm());

el.partnerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(el.partnerForm);
  const body = Object.fromEntries(formData.entries());
  for (const key of ["is_corporation", "is_invoice_issuer", "is_active"]) {
    body[key] = body[key] === "true";
  }
  const id = Number(body.id || 0);
  delete body.id;

  const url = id ? `/api/admin/partners/${id}` : "/api/admin/partners";
  const method = id ? "PATCH" : "POST";
  await fetchJson(url, { method, body: JSON.stringify(body) });
  await loadPartners();
  await loadDashboard();
  resetPartnerForm();
  showFlash("取引先を保存しました。");
});

el.partnersExport.addEventListener("click", () => {
  window.open("/api/admin/partners/export", "_blank");
});

el.partnersImportFile.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  el.partnersImportText.value = await file.text();
});

el.partnersImport.addEventListener("click", async () => {
  const csvText = el.partnersImportText.value.trim();
  if (!csvText) {
    showFlash("CSV text is empty.", "error");
    return;
  }
  const result = await fetchJson("/api/admin/partners/import", {
    method: "POST",
    body: JSON.stringify({ csvText })
  });
  renderImportResult(result);
  state.partners = result.partners ?? [];
  renderPartners();
  await loadDashboard();
  showFlash("CSVインポートを実行しました。");
});

el.ledgerContractLoad.addEventListener("click", async () => {
  const contractNo = el.ledgerContractSearch.value.trim() || el.ledgerContractNo.value.trim();
  if (!contractNo) {
    showFlash("契約番号を入力してください。", "error");
    return;
  }
  await loadLicenseLedgerTerms(contractNo);
  showFlash(`${contractNo} の金銭条件を読込しました。`);
});

el.ledgerTermsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const contractNo = el.ledgerContractNo.value.trim();
  if (!contractNo) {
    showFlash("契約番号を入力してください。", "error");
    return;
  }

  const terms = [1, 2, 3].map((termOrder) => ({
    contract_no: contractNo,
    term_order: termOrder,
    heading: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_heading`).value,
    region: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_region`).value,
    language: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_language`).value,
    region_language_label: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_region_language_label`).value,
    base_price_label: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_base_price_label`).value,
    calc_method: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_calc_method`).value,
    rate: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_rate`).value,
    share_rate: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_share_rate`).value,
    calc_period: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_calc_period`).value,
    mg_ag: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_mg_ag`).value,
    payment_terms: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_payment_terms`).value,
    formula: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_formula`).value,
    formula_note: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_formula_note`).value,
    summary: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_summary`).value,
    note: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_note`).value,
    currency: el.ledgerTermsForm.elements.namedItem(`term${termOrder}_currency`).value
  }));

  const result = await fetchJson(`/api/admin/license-ledger-terms/${encodeURIComponent(contractNo)}`, {
    method: "PUT",
    body: JSON.stringify({ terms })
  });
  state.ledgerTerms = result.terms ?? [];
  fillLedgerTermsForm(contractNo, state.ledgerTerms);
  renderLedgerTermsResult(state.ledgerTerms);
  showFlash(`${contractNo} の金銭条件を保存しました。`);
});

init().catch((error) => showFlash(error.message, "error"));
