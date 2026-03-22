export type BacklogIssueTypeSpec = {
  name: string;
  color: string;
};

export type BacklogFieldTypeName =
  | "string"
  | "text"
  | "number"
  | "date"
  | "single_list"
  | "checkbox";

export type BacklogCustomFieldSpec = {
  name: string;
  type: BacklogFieldTypeName;
  required: boolean;
  issueTypes: string[];
  description?: string;
  items?: string[];
  allowInput?: boolean;
  allowAddItem?: boolean;
};

export const backlogIssueTypeSpecs: BacklogIssueTypeSpec[] = [
  { name: "業務委託基本契約", color: "#3B82F6" },
  { name: "ライセンス契約", color: "#8B5CF6" },
  { name: "NDA", color: "#64748B" },
  { name: "発注書", color: "#059669" },
  { name: "企画発注書", color: "#0EA5E9" },
  { name: "売買契約（当社買手）", color: "#F59E0B" },
  { name: "売買契約（当社売手・標準）", color: "#EF4444" },
  { name: "売買契約（当社売手・保証金掛け売り）", color: "#DC2626" },
  { name: "納品リクエスト", color: "#10B981" }
];

export const backlogCustomFieldSpecs: BacklogCustomFieldSpec[] = [
  {
    name: "contract_date_year",
    type: "number",
    required: true,
    issueTypes: ["業務委託基本契約"]
  },
  {
    name: "contract_date_month",
    type: "number",
    required: true,
    issueTypes: ["業務委託基本契約"]
  },
  {
    name: "contract_date_day",
    type: "number",
    required: true,
    issueTypes: ["業務委託基本契約"]
  },
  {
    name: "remarks",
    type: "text",
    required: false,
    issueTypes: ["業務委託基本契約", "発注書", "企画発注書"]
  },
  {
    name: "vendor_phone",
    type: "string",
    required: true,
    issueTypes: ["業務委託基本契約"]
  },
  {
    name: "credit_name",
    type: "string",
    required: false,
    issueTypes: ["ライセンス契約"]
  },
  {
    name: "has_remarks",
    type: "checkbox",
    required: false,
    issueTypes: ["ライセンス契約"]
  },
  {
    name: "jurisdiction",
    type: "string",
    required: true,
    issueTypes: ["ライセンス契約"]
  },
  {
    name: "original_author",
    type: "string",
    required: false,
    issueTypes: ["ライセンス契約"]
  },
  {
    name: "original_work",
    type: "string",
    required: true,
    issueTypes: ["ライセンス契約"]
  },
  {
    name: "transfer_fee_payer",
    type: "single_list",
    required: false,
    issueTypes: ["発注書", "企画発注書"],
    items: ["発注者負担", "受注者負担", "協議"],
    allowInput: true,
    allowAddItem: true
  },
  {
    name: "accept_by_performance",
    type: "checkbox",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "accept_required",
    type: "checkbox",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "show_sign_section",
    type: "checkbox",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "vendor_accept_type",
    type: "single_list",
    required: false,
    issueTypes: ["発注書", "企画発注書"],
    items: ["メール", "Slack", "書面", "署名不要"],
    allowInput: true,
    allowAddItem: true
  },
  {
    name: "accept_method",
    type: "single_list",
    required: true,
    issueTypes: ["発注書", "企画発注書"],
    items: ["メール", "Slack", "書面", "検収不要"],
    allowInput: true,
    allowAddItem: true
  },
  {
    name: "accept_reply_due_date",
    type: "date",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "bank_info",
    type: "text",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "delivery_date",
    type: "date",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "item_name",
    type: "string",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "master_contract_ref",
    type: "string",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "order_date_year",
    type: "number",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "order_date_month",
    type: "number",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "order_date_day",
    type: "number",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "payment_terms",
    type: "text",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "project_title",
    type: "string",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "special_terms",
    type: "text",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "vendor_accept_date",
    type: "date",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "vendor_accept_name",
    type: "string",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "vendor_contact_department",
    type: "string",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "vendor_suffix",
    type: "string",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "staff_department",
    type: "string",
    required: false,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "amount",
    type: "number",
    required: true,
    issueTypes: ["発注書", "企画発注書"]
  },
  {
    name: "category",
    type: "single_list",
    required: true,
    issueTypes: ["発注書", "企画発注書"],
    items: ["制作", "監修", "デザイン", "ライセンス", "その他"],
    allowInput: true,
    allowAddItem: true
  },
  {
    name: "pay_method",
    type: "single_list",
    required: true,
    issueTypes: ["発注書", "企画発注書"],
    items: ["一括払い", "分割払い", "サブスクリプション", "業績連動", "検収後支払"],
    allowInput: true,
    allowAddItem: true
  },
  {
    name: "first_draft_deadline",
    type: "date",
    required: true,
    issueTypes: ["企画発注書"]
  },
  {
    name: "final_deadline",
    type: "date",
    required: true,
    issueTypes: ["企画発注書"]
  },
  {
    name: "approval_comments",
    type: "text",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "approval_date",
    type: "date",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "approver_department",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "approver_name",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "business_description",
    type: "text",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "delivery_type",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "delivery_url",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "milestone_name",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "partial_number",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "person_department",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "person_name",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "project_name",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "reviewer_department",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "reviewer_name",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "is_final_delivery",
    type: "checkbox",
    required: false,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "amountchangereason",
    type: "text",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "completiondate",
    type: "date",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "hasamountchange",
    type: "checkbox",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "hasrevision",
    type: "checkbox",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "iscompleted",
    type: "checkbox",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "name",
    type: "string",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "newamount",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "no",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "notes",
    type: "text",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "originalamount",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "revisiondetail",
    type: "text",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "spec",
    type: "text",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "thistimequantity",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "totalquantity",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "unitprice",
    type: "number",
    required: true,
    issueTypes: ["納品リクエスト"]
  },
  {
    name: "confidentiality_years",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "contract_date",
    type: "date",
    required: true,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "cure_period_days",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社買手）"]
  },
  {
    name: "delivery_location",
    type: "string",
    required: false,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "inspection_period_days",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "payment_condition_summary",
    type: "text",
    required: false,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "product_scope",
    type: "text",
    required: false,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "warranty_period",
    type: "number",
    required: false,
    issueTypes: ["売買契約（当社買手）", "売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "cod_delivery_days",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・標準）"]
  },
  {
    name: "delivery_days_after_payment",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・標準）"]
  },
  {
    name: "monthly_closing_day",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・標準）", "売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "monthly_payment_due_day",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・標準）"]
  },
  {
    name: "payment_method",
    type: "single_list",
    required: true,
    issueTypes: ["売買契約（当社売手・標準）"],
    items: ["前払い", "代引", "月末締め翌月末払い"],
    allowInput: true,
    allowAddItem: true
  },
  {
    name: "prepay_deadline_days",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・標準）"]
  },
  {
    name: "delivery_fee_threshold",
    type: "number",
    required: false,
    issueTypes: ["売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "deposit_replenish_days",
    type: "number",
    required: false,
    issueTypes: ["売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "payment_due_day",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・保証金掛け売り）"]
  },
  {
    name: "security_deposit_amount",
    type: "number",
    required: true,
    issueTypes: ["売買契約（当社売手・保証金掛け売り）"]
  }
];
