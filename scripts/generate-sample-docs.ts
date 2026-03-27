import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DocumentService } from "../src/services/documentService.js";
import { templateCatalog } from "../src/templateCatalog.js";
import { IssueRecord } from "../src/types.js";

const rootDir = process.cwd();
const sampleDir = path.join(rootDir, "sample");

function makePayload(templateKey: string): Record<string, unknown> {
  return {
    CONTRACT_NO: "SAMPLE-2026-0001",
    contract_no: "SAMPLE-2026-0001",
    ORDER_NO: "ORD-2026-0001",
    order_no: "ORD-2026-0001",
    ORDER_DATE_YEAR: "2026",
    ORDER_DATE_MONTH: "03",
    ORDER_DATE_DAY: "21",
    CONTRACT_DATE_YEAR: "2026",
    CONTRACT_DATE_MONTH: "03",
    CONTRACT_DATE_DAY: "21",
    CONTRACT_DATE_FORMATTED: "2026年3月21日",
    ISSUE_DATE: "2026年3月21日",
    NOTICE_ID: "NOTICE-2026-0001",
    PROJECT_TITLE: "サンプル案件",
    project_name: "サンプル案件",
    PARTY_A_NAME: "株式会社アークライト",
    PARTY_A_ADDRESS: "東京都千代田区サンプル1-2-3",
    PARTY_A_REP: "代表取締役 サンプル太郎",
    PARTY_A_REPRESENTATIVE: "代表取締役 サンプル太郎",
    PARTY_A_IS_CORPORATION: true,
    VENDOR_NAME: "合同会社サンプルベンダー",
    vendor_name: "合同会社サンプルベンダー",
    VENDOR_SUFFIX: "御中",
    VENDOR_ADDRESS: "大阪府大阪市サンプル4-5-6",
    VENDOR_REP: "代表社員 山田花子",
    VENDOR_IS_CORPORATION: true,
    VENDOR_EMAIL: "vendor@example.com",
    VENDOR_PHONE: "06-0000-0000",
    VENDOR_CONTACT_NAME: "山田花子",
    VENDOR_CONTACT_DEPARTMENT: "営業部",
    VENDOR_INVOICE_NUM: "T1234567890123",
    vendor_invoice_num: "T1234567890123",
    INVOICE_REGISTRATION_NUMBER: "T1234567890123",
    IS_INVOICE_ISSUER: true,
    STAFF_NAME: "法務担当",
    STAFF_PHONE: "03-0000-0000",
    STAFF_EMAIL: "legal@example.com",
    DELIVERY_DATE: "2026年4月15日",
    FIRST_DRAFT_DEADLINE: "2026年4月05日",
    FINAL_DEADLINE: "2026年4月15日",
    PAYMENT_TERMS: "月末締め翌月末払い",
    PAYMENT_DATE: "2026年4月30日",
    PAYMENT_METHOD: "銀行振込",
    PAYMENT_CONDITION_SUMMARY: "月末締め翌月末払い",
    BANK_NAME: "サンプル銀行",
    BRANCH_NAME: "本店営業部",
    ACCOUNT_TYPE: "普通",
    ACCOUNT_NUMBER: "1234567",
    ACCOUNT_HOLDER_KANA: "ｻﾝﾌﾟﾙﾍﾞﾝﾀﾞｰ",
    BANK_ACCOUNT_NAME: "サンプルベンダー",
    BANK_ACCOUNT_NO: "1234567",
    BANK_BRANCH: "本店営業部",
    BANK_INFO: "サンプル銀行 本店営業部 普通 1234567",
    REMARKS: `${templateKey} のサンプルテストです。`,
    SPECIAL_TERMS: "特記事項なし",
    SPECIAL_NOTE: "特記事項なし",
    PRODUCT_SCOPE: "キャラクター商品、販促物、映像素材一式",
    ORIGINAL_AUTHOR: "原作者A",
    ORIGINAL_WORK: "サンプル作品",
    JURISDICTION: "東京地方裁判所",
    DELIVERY_LOCATION: "東京都内指定場所",
    WARRANTY_PERIOD: "6か月",
    COD_DELIVERY_DAYS: "3営業日",
    DELIVERY_DAYS_AFTER_PAYMENT: "入金確認後5営業日",
    MONTHLY_CLOSING_DAY: "末日",
    MONTHLY_PAYMENT_DUE_DAY: "翌月末日",
    PREPAY_DEADLINE_DAYS: "5",
    CREDIT_NAME: "サンプルIP",
    MASTER_CONTRACT_REF: "基本契約書第1号",
    ACCEPT_METHOD: "メール承認",
    ACCEPT_REPLY_DUE_DATE: "2026年3月25日",
    TRANSFER_FEE_PAYER: "乙負担",
    SENDER_NAME: "株式会社アークライト 法務部",
    SENDER_ADDRESS: "東京都千代田区サンプル1-2-3",
    SENDER_ZIP: "100-0001",
    SENDER_DEPT: "法務部",
    amountExcludingTax: 480000,
    grandTotalExTax: 480000,
    totalFee: 400000,
    totalExp: 80000,
    CONTRACTOR_NAME: "合同会社サンプルベンダー",
    CONTRACTOR_INVOICE_NUM: "T1234567890123",
    detail: "サンプル明細",
    calculation: "売上の10%",
    period: "2026年3月分",
    reportingPeriod: "2026年3月分",
    items: [
      {
        name: "企画制作",
        item_name: "企画制作",
        spec: "構成案作成・会議2回",
        detailText: "構成案作成・会議2回",
        unitPrice: 300000,
        unit_price: 300000,
        qty: 1,
        thisTimeQuantity: 1,
        payment_date: "2026年4月30日",
        deliveryDateStr: "2026年4月10日"
      },
      {
        name: "進行管理",
        item_name: "進行管理",
        spec: "撮影進行・素材管理",
        detailText: "撮影進行・素材管理",
        unitPrice: 180000,
        unit_price: 180000,
        qty: 1,
        thisTimeQuantity: 1,
        payment_date: "2026年4月30日",
        deliveryDateStr: "2026年4月15日"
      }
    ]
  };
}

async function main(): Promise<void> {
  await mkdir(sampleDir, { recursive: true });
  const documentService = new DocumentService(sampleDir, path.join(rootDir, "templates"));
  const results: Array<Record<string, string>> = [];
  const requestedTemplateKeys = process.argv.slice(2);
  const templates =
    requestedTemplateKeys.length > 0
      ? templateCatalog.filter((template) => requestedTemplateKeys.includes(template.key))
      : templateCatalog;

  if (requestedTemplateKeys.length > 0 && templates.length !== requestedTemplateKeys.length) {
    const foundKeys = new Set(templates.map((template) => template.key));
    const missingKeys = requestedTemplateKeys.filter((key) => !foundKeys.has(key));
    throw new Error(`Unknown template key(s): ${missingKeys.join(", ")}`);
  }

  for (const template of templates) {
    const issue: IssueRecord = {
      id: `sample-${template.key}`,
      issueKey: `SAMPLE-${template.key.toUpperCase()}`,
      title: `${template.name} サンプル`,
      requester: "test-runner",
      assignee: "codex",
      templateKey: template.key,
      status: "Draft",
      contractNo: "SAMPLE-2026-0001",
      payload: makePayload(template.key),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const document = await documentService.generate(issue);
    results.push({
      templateKey: template.key,
      templateName: template.name,
      pdf: path.basename(document.pdfPath),
      html: path.basename(document.htmlPath)
    });
  }

  await writeFile(
    path.join(sampleDir, "sample-results.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: results.length,
        results
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Generated ${results.length} sample document(s) in ${sampleDir}`);
}

await main();
