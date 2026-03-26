const space = (process.env.BACKLOG_SPACE || "").trim();
const projectId = (process.env.BACKLOG_PROJECT_ID || "").trim();
const apiKey = (process.env.BACKLOG_API_KEY || "").trim();

if (!space) throw new Error("BACKLOG_SPACE is not set.");
if (!projectId) throw new Error("BACKLOG_PROJECT_ID is not set.");
if (!apiKey) throw new Error("BACKLOG_API_KEY is not set.");

const baseUrl = /^https?:\/\//i.test(space) ? space.replace(/\/+$/, "") : `https://${space}.backlog.com`;

const typeIdMap = {
  string: 1,
  text: 2,
  date: 4,
  checkbox: 7
};

async function request(pathname, init = {}) {
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${baseUrl}${pathname}${separator}apiKey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" } : {})
    },
    body: init.body?.toString()
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function getIssueTypes() {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/issueTypes`);
}

async function getCustomFields() {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields`);
}

async function deleteCustomField(fieldId) {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields/${fieldId}`, {
    method: "DELETE"
  });
}

async function addCustomField(spec, applicableIssueTypeIds) {
  const body = new URLSearchParams();
  body.set("name", spec.name);
  body.set("typeId", String(typeIdMap[spec.type]));
  body.set("description", spec.description);
  body.set("required", spec.required ? "true" : "false");

  for (const id of applicableIssueTypeIds) {
    body.append("applicableIssueTypes[]", String(id));
  }

  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields`, {
    method: "POST",
    body
  });
}

const fieldsToDelete = [
  "attachment_url",
  "business_approval_status",
  "business_approver_slack_id",
  "counterparty_contact_name",
  "counterparty_email",
  "counterparty_name",
  "partner_code",
  "related_backlog_issue_key",
  "requested_due_date",
  "requester_department",
  "requester_name",
  "stamp_target_url",
  "workflow_label"
];

const fieldsToAdd = [
  { name: "remarks_free", type: "text", description: "備考自由記載", required: false },
  { name: "show_order_sign_section", type: "checkbox", description: "発注書署名欄表示", required: false },
  { name: "staff_name", type: "string", description: "自社担当者名", required: false },
  { name: "staff_email", type: "string", description: "自社担当者メール", required: false },
  { name: "staff_phone", type: "string", description: "自社担当者電話番号", required: false }
];

const issueTypes = await getIssueTypes();
const issueTypeMap = new Map(issueTypes.map((item) => [item.name, item.id]));
const orderIssueTypeIds = ["発注書", "企画発注書"].map((name) => issueTypeMap.get(name)).filter(Boolean);

if (orderIssueTypeIds.length !== 2) {
  throw new Error("Issue types for 発注書 / 企画発注書 could not be resolved.");
}

let currentFields = await getCustomFields();
let fieldMap = new Map(currentFields.map((item) => [item.name, item]));

console.log(`Project: ${projectId}`);
console.log(`BaseUrl: ${baseUrl}`);
console.log("");
console.log("=== Delete unused fields ===");

for (const name of fieldsToDelete) {
  const existing = fieldMap.get(name);
  if (!existing) {
    console.log(`SKIP missing: ${name}`);
    continue;
  }

  await deleteCustomField(existing.id);
  console.log(`DELETE: ${name}`);
}

currentFields = await getCustomFields();
fieldMap = new Map(currentFields.map((item) => [item.name, item]));

console.log("");
console.log("=== Add remaining order fields ===");

for (const spec of fieldsToAdd) {
  if (fieldMap.has(spec.name)) {
    console.log(`SKIP exists: ${spec.name}`);
    continue;
  }

  const created = await addCustomField(spec, orderIssueTypeIds);
  console.log(`ADD: ${created.name}`);
}

console.log("");
console.log("Done.");
