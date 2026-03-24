import "dotenv/config";
import {
  backlogCustomStatusSpecs,
  backlogCustomFieldSpecs,
  backlogIssueTypeSpecs,
  BacklogCustomFieldSpec,
  BacklogFieldTypeName
} from "../src/backlogSetupCatalog.js";

type BacklogIssueType = {
  id: number;
  name: string;
  color?: string;
};

type BacklogCustomField = {
  id: number;
  name: string;
  typeId: number;
  description?: string;
  required?: boolean;
  applicableIssueTypes?: Array<{ id: number; name: string }>;
  items?: Array<{ id: number; name: string }>;
};

type BacklogStatus = {
  id: number;
  name: string;
  color?: string;
};

const FIELD_TYPE_ID: Record<BacklogFieldTypeName, number> = {
  string: 1,
  text: 2,
  number: 3,
  date: 4,
  single_list: 5,
  checkbox: 7
};

const JAPANESE_LABELS: Record<string, string> = {
  requester_name: "申請者名",
  requester_department: "所属部署名",
  partner_code: "取引先コード",
  counterparty_name: "相手方名",
  counterparty_contact_name: "相手方担当者",
  counterparty_email: "相手方メールアドレス",
  related_backlog_issue_key: "関連Backlog課題キー",
  requested_due_date: "希望期日",
  attachment_url: "添付ファイルURL",
  business_approver_slack_id: "事業部承認者SlackID",
  business_approval_status: "事業部承認状態",
  stamp_target_url: "押印対象URL",
  workflow_label: "ワークフロー種別",
  contract_date_year: "契約年",
  contract_date_month: "契約月",
  contract_date_day: "契約日",
  remarks: "備考",
  vendor_phone: "相手方電話番号",
  credit_name: "クレジット表記",
  has_remarks: "備考条項あり",
  jurisdiction: "管轄",
  original_author: "原著作者",
  original_work: "原著作物",
  transfer_fee_payer: "振込手数料負担",
  accept_by_performance: "成果物で検収",
  accept_required: "検収要否",
  show_sign_section: "署名欄表示",
  vendor_accept_type: "相手方承諾方法",
  accept_method: "検収方法",
  accept_reply_due_date: "検収回答期限",
  bank_info: "振込先情報",
  delivery_date: "納品日",
  item_name: "件名",
  master_contract_ref: "基本契約参照番号",
  order_date_year: "発注年",
  order_date_month: "発注月",
  order_date_day: "発注日",
  payment_terms: "支払条件",
  project_title: "案件名",
  special_terms: "特約",
  vendor_accept_date: "相手方承諾日",
  vendor_accept_name: "相手方承諾者名",
  vendor_contact_department: "相手方担当部署",
  vendor_suffix: "相手方敬称",
  staff_department: "自社担当部署",
  amount: "金額",
  category: "区分",
  pay_method: "支払方法",
  first_draft_deadline: "初稿期限",
  final_deadline: "最終納期",
  approval_comments: "検収承認コメント",
  approval_date: "検収承認日時",
  approver_department: "自社検収承認者部署",
  approver_name: "自社検収承認者名",
  business_description: "業務内容",
  delivery_type: "納品種別",
  delivery_url: "納品URL",
  milestone_name: "マイルストーン名",
  partial_number: "分納番号",
  person_department: "自社検収担当部署",
  person_name: "自社検収担当者名",
  project_name: "案件名",
  reviewer_department: "自社検収確認者部署",
  reviewer_name: "自社検収確認者名",
  is_final_delivery: "最終納品フラグ",
  amountchangereason: "金額変更理由",
  completiondate: "完了日",
  hasamountchange: "金額変更あり",
  hasrevision: "修正あり",
  iscompleted: "完了フラグ",
  name: "名称",
  newamount: "変更後金額",
  no: "番号",
  notes: "明細備考",
  originalamount: "変更前金額",
  revisiondetail: "修正内容",
  spec: "仕様",
  thistimequantity: "今回数量",
  totalquantity: "累計数量",
  unitprice: "単価",
  confidentiality_years: "秘密保持年数",
  contract_date: "契約日",
  cure_period_days: "追完期間日数",
  delivery_location: "納品場所",
  inspection_period_days: "検収期間日数",
  payment_condition_summary: "支払条件概要",
  product_scope: "対象範囲",
  warranty_period: "保証期間",
  cod_delivery_days: "代引納品日数",
  delivery_days_after_payment: "入金後納品日数",
  monthly_closing_day: "月次締日",
  monthly_payment_due_day: "月次支払日",
  payment_method: "支払方法",
  prepay_deadline_days: "前払期限日数",
  delivery_fee_threshold: "送料閾値",
  deposit_replenish_days: "保証金補充日数",
  payment_due_day: "支払日",
  security_deposit_amount: "保証金額"
};

function usage(): void {
  console.log("Usage:");
  console.log("  tsx scripts/sync-backlog-custom-fields.ts --dry-run");
  console.log("  tsx scripts/sync-backlog-custom-fields.ts --apply");
  console.log("  tsx scripts/sync-backlog-custom-fields.ts --apply --custom-fields-only");
  console.log("  tsx scripts/sync-backlog-custom-fields.ts --apply --statuses-only");
}

function getBaseUrl(): string {
  const space = (process.env.BACKLOG_SPACE || "").trim();
  if (!space) {
    throw new Error("BACKLOG_SPACE is not configured.");
  }
  if (/^https?:\/\//i.test(space)) {
    return space.replace(/\/+$/, "");
  }
  return `https://${space}.backlog.com`;
}

function getProjectIdOrKey(): string {
  const projectIdOrKey = (process.env.BACKLOG_PROJECT_ID || "").trim();
  if (!projectIdOrKey) {
    throw new Error("BACKLOG_PROJECT_ID is not configured.");
  }
  return projectIdOrKey;
}

function getApiKey(): string {
  const apiKey = (process.env.BACKLOG_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("BACKLOG_API_KEY is not configured.");
  }
  return apiKey;
}

async function request<T>(
  pathname: string,
  init?: { method?: "GET" | "POST" | "PATCH"; body?: URLSearchParams }
): Promise<T> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${baseUrl}${pathname}${separator}apiKey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" } : {})
    },
    body: init?.body?.toString()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backlog API error: ${response.status} ${response.statusText} ${body}`);
  }

  return (await response.json()) as T;
}

async function getIssueTypes(): Promise<BacklogIssueType[]> {
  return request<BacklogIssueType[]>(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/issueTypes`);
}

async function getCustomFields(): Promise<BacklogCustomField[]> {
  return request<BacklogCustomField[]>(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/customFields`);
}

async function getStatuses(): Promise<BacklogStatus[]> {
  return request<BacklogStatus[]>(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/statuses`);
}

async function addIssueType(name: string, color: string): Promise<BacklogIssueType> {
  return request<BacklogIssueType>(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/issueTypes`, {
    method: "POST",
    body: new URLSearchParams({
      name,
      color
    })
  });
}

async function addStatus(name: string, color: string): Promise<BacklogStatus> {
  return request<BacklogStatus>(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/statuses`, {
    method: "POST",
    body: new URLSearchParams({
      name,
      color
    })
  });
}

async function addCustomField(spec: BacklogCustomFieldSpec, issueTypesByName: Map<string, BacklogIssueType>) {
  const body = new URLSearchParams();
  body.set("name", spec.name);
  body.set("typeId", String(FIELD_TYPE_ID[spec.type]));
  const createRequired = spec.type === "single_list" || spec.type === "checkbox" ? false : spec.required;
  body.set("required", createRequired ? "true" : "false");
  const description = spec.description ?? JAPANESE_LABELS[spec.name];
  if (description) {
    body.set("description", description);
  }

  const applicableIds = spec.issueTypes
    .map((name) => issueTypesByName.get(name)?.id)
    .filter((value): value is number => typeof value === "number");

  for (const issueTypeId of applicableIds) {
    body.append("applicableIssueTypes[]", String(issueTypeId));
  }

  if (spec.type === "single_list") {
    body.set("allowInput", spec.allowInput ? "true" : "false");
    body.set("allowAddItem", spec.allowAddItem ? "true" : "false");
  }

  return request<BacklogCustomField>(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/customFields`, {
    method: "POST",
    body
  });
}

async function updateCustomField(fieldId: number, params: { required?: boolean; description?: string }): Promise<void> {
  const body = new URLSearchParams();
  if (typeof params.required === "boolean") {
    body.set("required", params.required ? "true" : "false");
  }
  if (params.description) {
    body.set("description", params.description);
  }
  await request(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/customFields/${fieldId}`, {
    method: "PATCH",
    body
  });
}

async function addListItem(fieldId: number, name: string): Promise<void> {
  await request(`/api/v2/projects/${encodeURIComponent(getProjectIdOrKey())}/customFields/${fieldId}/items`, {
    method: "POST",
    body: new URLSearchParams({ name })
  });
}

async function ensureIssueTypes(apply: boolean): Promise<Map<string, BacklogIssueType>> {
  const current = await getIssueTypes();
  const byName = new Map(current.map((item) => [item.name, item]));

  for (const spec of backlogIssueTypeSpecs) {
    if (byName.has(spec.name)) {
      console.log(`SKIP issue type exists: ${spec.name}`);
      continue;
    }

    if (!apply) {
      console.log(`PLAN add issue type: ${spec.name} (${spec.color})`);
      continue;
    }

    const created = await addIssueType(spec.name, spec.color);
    byName.set(created.name, created);
    console.log(`ADD issue type: ${created.name}`);
  }

  if (!apply) {
    const refreshed = await getIssueTypes();
    return new Map(refreshed.map((item) => [item.name, item]));
  }

  return byName;
}

async function ensureStatuses(apply: boolean): Promise<void> {
  const current = await getStatuses();
  const byName = new Map(current.map((item) => [item.name, item]));
  const maxStatuses = 12;

  for (const spec of backlogCustomStatusSpecs) {
    if (byName.has(spec.name)) {
      console.log(`SKIP status exists: ${spec.name}`);
      continue;
    }

    if (!apply) {
      console.log(`PLAN add status: ${spec.name} (${spec.color})`);
      continue;
    }

     if (byName.size >= maxStatuses) {
      console.log(`WARN status limit reached (${byName.size}/${maxStatuses}). Skip add status: ${spec.name}`);
      continue;
    }

    try {
      const created = await addStatus(spec.name, spec.color);
      byName.set(created.name, created);
      console.log(`ADD status: ${created.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("maximum number of status")) {
        console.log(`WARN status limit reached (${byName.size}/${maxStatuses}). Skip remaining new statuses.`);
        return;
      }
      throw error;
    }
  }
}

async function ensureCustomFields(apply: boolean, issueTypesByName: Map<string, BacklogIssueType>): Promise<void> {
  const current = await getCustomFields();
  const byName = new Map(current.map((item) => [item.name, item]));

  for (const spec of backlogCustomFieldSpecs) {
    const existing = byName.get(spec.name);
    if (!existing) {
      if (!apply) {
        console.log(`PLAN add custom field: ${spec.name} [${spec.type}]`);
        continue;
      }

      const created = await addCustomField(spec, issueTypesByName);
      byName.set(created.name, created);
      console.log(`ADD custom field: ${created.name} [${spec.type}]`);

      if (spec.type === "single_list" && spec.items?.length) {
        for (const item of spec.items) {
          await addListItem(created.id, item);
          console.log(`  ADD list item: ${created.name} -> ${item}`);
        }
        if (spec.required) {
          await updateCustomField(created.id, { required: true });
          console.log(`  PATCH required: ${created.name} -> true`);
        }
      }
      const description = spec.description ?? JAPANESE_LABELS[spec.name];
      if (description) {
        await updateCustomField(created.id, { description });
        console.log(`  PATCH description: ${created.name} -> ${description}`);
      }
      continue;
    }

    console.log(`SKIP custom field exists: ${spec.name}`);
    const description = spec.description ?? JAPANESE_LABELS[spec.name];
    if (description !== (existing.description ?? "")) {
      if (!apply) {
        console.log(`  PLAN patch description: ${spec.name} -> ${description}`);
      } else {
        await updateCustomField(existing.id, { description });
        console.log(`  PATCH description: ${spec.name} -> ${description}`);
      }
    }
    if (spec.type !== "single_list" || !spec.items?.length) {
      continue;
    }

    const existingItems = new Set((existing.items ?? []).map((item) => item.name));
    for (const item of spec.items) {
      if (existingItems.has(item)) {
        console.log(`  SKIP list item exists: ${spec.name} -> ${item}`);
        continue;
      }

      if (!apply) {
        console.log(`  PLAN add list item: ${spec.name} -> ${item}`);
        continue;
      }

      await addListItem(existing.id, item);
      console.log(`  ADD list item: ${spec.name} -> ${item}`);
    }
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    usage();
    return;
  }

  const apply = args.has("--apply");
  const customFieldsOnly = args.has("--custom-fields-only");
  const statusesOnly = args.has("--statuses-only");

  if (!apply && !args.has("--dry-run")) {
    usage();
    throw new Error("Specify --dry-run or --apply.");
  }

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Project: ${getProjectIdOrKey()}`);

  if (!customFieldsOnly) {
    await ensureStatuses(apply);
  }

  if (!statusesOnly) {
    const issueTypesByName = customFieldsOnly
      ? new Map((await getIssueTypes()).map((item) => [item.name, item]))
      : await ensureIssueTypes(apply);
    await ensureCustomFields(apply, issueTypesByName);
  }
}

await main();
