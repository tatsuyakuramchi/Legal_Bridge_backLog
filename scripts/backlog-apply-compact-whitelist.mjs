const space = (process.env.BACKLOG_SPACE || "").trim();
const projectId = (process.env.BACKLOG_PROJECT_ID || "").trim();
const apiKey = (process.env.BACKLOG_API_KEY || "").trim();
const apply = process.argv.includes("--apply");

if (!space || !projectId || !apiKey) {
  throw new Error("BACKLOG_SPACE / BACKLOG_PROJECT_ID / BACKLOG_API_KEY must be set.");
}

const baseUrl = /^https?:\/\//i.test(space) ? space.replace(/\/+$/, "") : `https://${space}.backlog.com`;

const KEEP_FIELDS = [
  "accept_by_performance",
  "accept_method",
  "accept_reply_due_date",
  "accept_required",
  "amount",
  "amountchangereason",
  "approval_comments",
  "approval_date",
  "approver_department",
  "approver_name",
  "bank_info",
  "baseamount",
  "business_description",
  "calculation",
  "category",
  "cod_delivery_days",
  "completiondate",
  "confidentiality_period",
  "confidentiality_years",
  "contract_date",
  "contract_period",
  "credit_name",
  "cure_period_days",
  "date",
  "deduction",
  "deduction_note",
  "delivery_date",
  "delivery_days_after_payment",
  "delivery_fee_threshold",
  "delivery_location",
  "delivery_type",
  "delivery_url",
  "deposit_replenish_days",
  "detail",
  "final_deadline",
  "first_draft_deadline",
  "hasamountchange",
  "hasrevision",
  "inspection_period_days",
  "is_final_delivery",
  "iscompleted",
  "issue_date",
  "item_name",
  "jurisdiction",
  "master_contract_ref",
  "milestone_name",
  "minimum_guarantee",
  "monthly_closing_day",
  "monthly_payment_due_day",
  "name",
  "nda_purpose",
  "newamount",
  "no",
  "notes",
  "order_date",
  "original_author",
  "original_work",
  "originalamount",
  "partial_number",
  "pay_method",
  "payment_condition_summary",
  "payment_date",
  "payment_due_date",
  "payment_due_day",
  "payment_method",
  "payment_terms",
  "period",
  "period_text",
  "person_department",
  "person_name",
  "prepay_deadline_days",
  "product_scope",
  "project_name",
  "project_title",
  "qty",
  "rate",
  "remarks",
  "reviewer_department",
  "reviewer_name",
  "revisiondetail",
  "revshare_basis",
  "revshare_note",
  "security_deposit_amount",
  "show_order_sign_section",
  "show_sign_section",
  "spec",
  "special_note",
  "special_terms",
  "thistimequantity",
  "totalquantity",
  "transfer_fee_payer",
  "unit_price",
  "unitprice",
  "vendor_accept_date",
  "vendor_accept_name",
  "vendor_accept_type",
  "vendor_contact_department",
  "warranty_period",
  "work_start_date",
  "承継覚書日付"
].sort();

const ADD_SPECS = [
  {
    name: "baseamount",
    typeId: 3,
    description: "売上基準額",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "calculation",
    typeId: 2,
    description: "計算式・計算根拠",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "deduction",
    typeId: 3,
    description: "控除額",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "deduction_note",
    typeId: 2,
    description: "控除備考",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "minimum_guarantee",
    typeId: 3,
    description: "最低保証額",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "order_date",
    typeId: 4,
    description: "発注日",
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "payment_date",
    typeId: 4,
    description: "支払予定日",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "payment_due_date",
    typeId: 4,
    description: "支払期限",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "period",
    typeId: 1,
    description: "対象期間",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "period_text",
    typeId: 1,
    description: "期間表示文言",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "revshare_basis",
    typeId: 2,
    description: "レベニューシェア算出根拠",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "revshare_note",
    typeId: 2,
    description: "レベニューシェア備考",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "special_note",
    typeId: 2,
    description: "特記事項",
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "unit_price",
    typeId: 3,
    description: "単価",
    issueTypes: ["納品リクエスト"]
  }
];

async function request(pathname, init = {}) {
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${baseUrl}${pathname}${separator}apiKey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function getCustomFields() {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields`);
}

async function getIssueTypes() {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/issueTypes`);
}

async function deleteCustomField(fieldId) {
  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields/${fieldId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" }
  });
}

async function addCustomField(spec, issueTypeMap) {
  const body = new URLSearchParams();
  body.set("name", spec.name);
  body.set("typeId", String(spec.typeId));
  body.set("description", spec.description);
  body.set("required", "false");
  for (const issueType of spec.issueTypes) {
    const id = issueTypeMap.get(issueType);
    if (!id) {
      throw new Error(`Issue type not found: ${issueType}`);
    }
    body.append("applicableIssueTypes[]", String(id));
  }

  return request(`/api/v2/projects/${encodeURIComponent(projectId)}/customFields`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
    },
    body: body.toString()
  });
}

async function main() {
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Project: ${projectId}`);
  console.log(`KeepCount: ${KEEP_FIELDS.length}`);

  const [currentFields, issueTypes] = await Promise.all([getCustomFields(), getIssueTypes()]);
  const currentMap = new Map(currentFields.map((field) => [field.name, field]));
  const issueTypeMap = new Map(issueTypes.map((item) => [item.name, item.id]));

  const toDelete = currentFields
    .filter((field) => !KEEP_FIELDS.includes(field.name))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const toAdd = ADD_SPECS.filter((spec) => !currentMap.has(spec.name)).sort((a, b) =>
    a.name.localeCompare(b.name, "ja")
  );

  console.log("\n=== Delete ===");
  for (const field of toDelete) {
    if (!apply) {
      console.log(`PLAN delete: ${field.name}`);
      continue;
    }
    await deleteCustomField(field.id);
    console.log(`DELETE: ${field.name}`);
  }

  console.log("\n=== Add ===");
  for (const spec of toAdd) {
    if (!apply) {
      console.log(`PLAN add: ${spec.name}`);
      continue;
    }
    await addCustomField(spec, issueTypeMap);
    console.log(`ADD: ${spec.name}`);
  }

  console.log("\nDone.");
}

await main();
