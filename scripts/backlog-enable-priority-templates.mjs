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
  date: 4
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

const issueTypeMap = new Map((await getIssueTypes()).map((item) => [item.name, item.id]));
const issueTypeIdsByName = {
  license_basic: [issueTypeMap.get("ライセンス契約")].filter(Boolean),
  nda: [issueTypeMap.get("NDA")].filter(Boolean),
  royalty_report: [issueTypeMap.get("納品リクエスト")].filter(Boolean)
};

const fieldsToDelete = [
  "staff_department"
];

const fieldsToAdd = [
  {
    name: "承継覚書日付",
    type: "string",
    description: "承継覚書日付",
    required: false,
    issueTypeIds: issueTypeIdsByName.license_basic
  },
  {
    name: "confidentiality_period",
    type: "string",
    description: "秘密保持期間",
    required: true,
    issueTypeIds: issueTypeIdsByName.nda
  },
  {
    name: "contract_date_formatted",
    type: "string",
    description: "契約日（整形済み）",
    required: true,
    issueTypeIds: issueTypeIdsByName.nda
  },
  {
    name: "nda_purpose",
    type: "text",
    description: "秘密保持の目的",
    required: true,
    issueTypeIds: issueTypeIdsByName.nda
  },
  {
    name: "issue_date",
    type: "date",
    description: "発行日",
    required: true,
    issueTypeIds: issueTypeIdsByName.royalty_report
  },
  {
    name: "date",
    type: "date",
    description: "日付",
    required: true,
    issueTypeIds: issueTypeIdsByName.royalty_report
  },
  {
    name: "detail",
    type: "text",
    description: "明細内容",
    required: true,
    issueTypeIds: issueTypeIdsByName.royalty_report
  },
  {
    name: "qty",
    type: "number",
    description: "数量",
    required: true,
    issueTypeIds: issueTypeIdsByName.royalty_report
  },
  {
    name: "rate",
    type: "string",
    description: "料率",
    required: true,
    issueTypeIds: issueTypeIdsByName.royalty_report
  }
];

let currentFields = await getCustomFields();
let fieldMap = new Map(currentFields.map((item) => [item.name, item]));

console.log(`Project: ${projectId}`);
console.log(`BaseUrl: ${baseUrl}`);
console.log("");
console.log("=== Delete fields to free slots ===");

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
console.log("=== Add fields for priority templates ===");

for (const spec of fieldsToAdd) {
  if (fieldMap.has(spec.name)) {
    console.log(`SKIP exists: ${spec.name}`);
    continue;
  }

  const created = await addCustomField(spec, spec.issueTypeIds);
  console.log(`ADD: ${created.name}`);
}

console.log("");
console.log("Done.");
