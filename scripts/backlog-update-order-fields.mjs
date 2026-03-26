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
  number: 3,
  date: 4,
  single_list: 5,
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

  return response.json();
}

async function getIssueTypes() {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/issueTypes`);
}

async function getCustomFields() {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields`);
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

async function patchDescription(fieldId, description) {
  const body = new URLSearchParams();
  body.set("description", description);
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields/${fieldId}`, {
    method: "PATCH",
    body
  });
}

const issueTypes = await getIssueTypes();
const issueTypeMap = new Map(issueTypes.map((item) => [item.name, item.id]));
const orderIssueTypeIds = ["発注書", "企画発注書"].map((name) => issueTypeMap.get(name)).filter(Boolean);

if (orderIssueTypeIds.length !== 2) {
  throw new Error("Issue types for 発注書 / 企画発注書 could not be resolved.");
}

let currentFields = await getCustomFields();
let fieldMap = new Map(currentFields.map((item) => [item.name, item]));

const fieldsToAdd = [
  { name: "contract_period", type: "text", description: "契約期間", required: false },
  { name: "work_start_date", type: "date", description: "作業開始日", required: false },
  { name: "remarks_free", type: "text", description: "備考自由記載", required: false },
  { name: "show_order_sign_section", type: "checkbox", description: "発注書署名欄表示", required: false },
  { name: "staff_name", type: "string", description: "自社担当者名", required: false },
  { name: "staff_email", type: "string", description: "自社担当者メール", required: false },
  { name: "staff_phone", type: "string", description: "自社担当者電話番号", required: false }
];

console.log(`Project: ${projectId}`);
console.log(`BaseUrl: ${baseUrl}`);
console.log("");
console.log("=== Add missing order fields ===");

for (const spec of fieldsToAdd) {
  if (fieldMap.has(spec.name)) {
    console.log(`SKIP exists: ${spec.name}`);
    continue;
  }

  try {
    const created = await addCustomField(spec, orderIssueTypeIds);
    console.log(`ADD: ${created.name}`);
  } catch (error) {
    console.log(`ERROR add: ${spec.name}`);
    throw error;
  }
}

currentFields = await getCustomFields();
fieldMap = new Map(currentFields.map((item) => [item.name, item]));

const fieldsToPatch = [
  { name: "accept_by_performance", description: "着手をもって承諾" },
  { name: "accept_required", description: "承諾書面要否" },
  { name: "show_sign_section", description: "受領署名欄表示" },
  { name: "vendor_accept_type", description: "受領方法" }
];

console.log("");
console.log("=== Patch descriptions for existing order fields ===");

for (const spec of fieldsToPatch) {
  const existing = fieldMap.get(spec.name);
  if (!existing) {
    console.log(`SKIP missing for patch: ${spec.name}`);
    continue;
  }

  await patchDescription(existing.id, spec.description);
  console.log(`PATCH: ${spec.name} -> ${spec.description}`);
}

console.log("");
console.log("Done.");
