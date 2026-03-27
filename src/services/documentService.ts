import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import Handlebars from "handlebars";
import { PDFDocument } from "pdf-lib";
import { ManagedTemplateDefinition, TemplateVariableDefinition } from "../templateManagerTypes.js";
import { templateCatalog } from "../templateCatalog.js";
import { DocumentRecord, IssueRecord } from "../types.js";

const execFileAsync = promisify(execFile);

type TemplatePlan = {
  issueType: string;
  deliveryType: string | null;
  vendorType: "CORP" | "INDIV";
  hasBaseContract: boolean;
  templateFiles: string[];
};

type ContextOptions = {
  templateFile: string;
  issueType: string;
  deliveryType: string | null;
  vendorType: "CORP" | "INDIV";
  hasBaseContract: boolean;
};

Handlebars.registerHelper("formatCurrency", (value: unknown) => {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) {
    return String(value ?? "");
  }
  return amount.toLocaleString("ja-JP");
});

Handlebars.registerHelper("formatDate", (value: unknown) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }
  return `${date.getFullYear()}\u5e74${date.getMonth() + 1}\u6708${date.getDate()}\u65e5`;
});

Handlebars.registerHelper("formatDateTime", (value: unknown) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }
  return `${date.getFullYear()}\u5e74${date.getMonth() + 1}\u6708${date.getDate()}\u65e5 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
});

Handlebars.registerHelper("add", (left: unknown, right: unknown) => Number(left ?? 0) + Number(right ?? 0));
Handlebars.registerHelper("invoiceRegistrationDisplay", (value: unknown) =>
  value
    ? "\u9069\u683c\u8acb\u6c42\u66f8\u767a\u884c\u4e8b\u696d\u8005\u767b\u9332: \u3042\u308a"
    : "\u9069\u683c\u8acb\u6c42\u66f8\u767a\u884c\u4e8b\u696d\u8005\u767b\u9332: \u306a\u3057"
);

const fallbackHtmlTemplate = Handlebars.compile(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>{{title}}</title>
    <style>
      body { font-family: "Yu Gothic", Meiryo, sans-serif; margin: 40px; color: #172033; }
      header { border-bottom: 2px solid #123a63; margin-bottom: 24px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      .meta { color: #52607a; font-size: 14px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      th, td { border: 1px solid #d6dde8; padding: 10px; vertical-align: top; }
      th { background: #eef4fa; width: 28%; text-align: left; }
      pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    </style>
  </head>
  <body>
    <header>
      <h1>{{title}}</h1>
      <div class="meta">Issue: {{issueKey}} / Status: {{status}} / Contract No: {{contractNo}}</div>
    </header>
    <section>
      <table>
        <tbody>
          {{#each fields}}
          <tr>
            <th>{{@key}}</th>
            <td><pre>{{this}}</pre></td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </section>
  </body>
</html>`);

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean) as string[];

const variableAliases: Record<string, string[]> = {
  PROJECT_TITLE: ["projectTitle", "projectName", "subject", "title"],
  VENDOR_NAME: ["vendorName", "counterpartyName", "partnerName"],
  VENDOR_ADDRESS: ["vendorAddress", "counterpartyAddress", "partnerAddress"],
  VENDOR_EMAIL: ["vendorEmail", "counterpartyEmail", "partnerEmail"],
  VENDOR_PHONE: ["vendorPhone", "counterpartyPhone", "partnerPhone"],
  VENDOR_CONTACT_NAME: ["vendorContactName", "contactName", "person_name"],
  VENDOR_CONTACT_DEPARTMENT: ["vendorContactDepartment", "contactDepartment"],
  STAFF_DEPARTMENT: ["staffDepartment", "staff_department"],
  VENDOR_REP: ["vendorRepresentative", "partnerRepresentative", "representative"],
  VENDOR_SUFFIX: ["vendorSuffix"],
  PARTY_B_NAME: ["vendorName", "counterpartyName", "partnerName"],
  PARTY_B_ADDRESS: ["vendorAddress", "counterpartyAddress", "partnerAddress"],
  PARTY_B_REP: ["vendorRepresentative", "partnerRepresentative", "representative"],
  CONTRACT_DATE: ["contractDate", "effectiveDate", "orderDate"],
  PAYMENT_DATE: ["paymentDate"],
  DELIVERY_DATE: ["deliveryDate"],
  NDA_PURPOSE: ["purpose", "ndaPurpose", "description"],
  PAYMENT_CONDITION_SUMMARY: ["paymentTerms", "paymentConditionSummary"],
  ISSUE_DATE: ["issueDate", "issue_date", "noticeDate", "notice_date"],
  PAYMENT_METHOD: ["paymentMethod"],
  PAYMENT_METHOD_DISPLAY: ["paymentMethod", "payment_method", "payMethod", "pay_method"],
  PAYMENT_TERMS: ["paymentTerms", "paymentConditionSummary"],
  RIGHTS_OWNER: ["rightsOwner", "rights_owner", "intellectualPropertyOwner", "ipOwner", "copyrightOwner"],
  RIGHTS_OWNER_DISPLAY: ["rightsOwner", "rights_owner", "intellectualPropertyOwner", "ipOwner", "copyrightOwner"],
  INTELLECTUAL_PROPERTY_OWNER: ["intellectualPropertyOwner", "ipOwner", "rightsOwner", "copyrightOwner"],
  REMARKS: ["remarks", "notes", "memo"],
  SPECIAL_TERMS: ["specialTerms"],
  CONTRACT_PERIOD: ["contractPeriod"],
  CONFIDENTIALITY_PERIOD: ["confidentialityPeriod"],
  CONFIDENTIALITY_YEARS: ["confidentialityYears"],
  CREDIT_NAME: ["creditName"],
  ORIGINAL_AUTHOR: ["originalAuthor"],
  ORIGINAL_WORK: ["originalWork"],
  JURISDICTION: ["jurisdiction"],
  ORDER_NO: ["orderNo"],
  ORDER_DATE_YEAR: ["orderDateYear"],
  ORDER_DATE_MONTH: ["orderDateMonth"],
  ORDER_DATE_DAY: ["orderDateDay"],
  licensor名: ["partnerName", "vendorName", "counterpartyName"],
  licensor_住所: ["partnerAddress", "vendorAddress", "counterpartyAddress"],
  licensor_氏名会社名: ["partnerName", "vendorName", "counterpartyName"],
  licensor_代表者名: ["partnerRepresentative", "vendorRepresentative", "representative"],
  LICENSOR_IS_CORPORATION: ["partnerIsCorporation", "vendorIsCorporation", "isCorporation", "is_corporation"],
  licensee名: ["partyAName", "PARTY_A_NAME", "companyName"],
  licensee_住所: ["partyAAddress", "PARTY_A_ADDRESS", "companyAddress"],
  licensee_氏名会社名: ["partyAName", "PARTY_A_NAME", "companyName"],
  licensee_代表者名: ["partyARepresentative", "PARTY_A_REP", "companyRepresentative"],
  LICENSEE_IS_CORPORATION: ["partyAIsCorporation", "PARTY_A_IS_CORPORATION", "companyIsCorporation"],
  基本契約名: ["baseContractName", "basicContractName", "masterContractRef", "master_contract_ref"],
  ライセンス種別名: ["licenseTypeName", "license_type_name", "licenseType"],
  許諾開始日: ["licenseStartDate", "license_start_date", "contractDate", "effectiveDate"],
  許諾期間注記: ["licensePeriodNote", "license_period_note", "contractPeriod", "contract_period"],
  原著作物名: ["originalWork", "original_work"],
  原著作物補記: ["originalWorkNote", "original_work_note"],
  対象製品予定名: ["projectTitle", "project_title", "productName", "product_name"],
  素材名: ["materialName", "material_name"],
  素材番号: ["materialNo", "material_no"],
  素材権利者: ["materialRightsHolder", "material_rights_holder", "rightsOwner", "rights_owner"],
  監修者: ["supervisor", "reviewSupervisor"],
  特記事項_本文: ["specialTerms", "special_terms", "specialNote", "special_note", "remarks"],
  金銭条件1_地域言語ラベル: ["paymentCondition1Label", "payment_condition_1_label"],
  金銭条件1_基準価格ラベル: ["paymentCondition1BaseLabel", "payment_condition_1_base_label"],
  金銭条件1_計算方式: ["paymentCondition1Method", "payment_condition_1_method", "paymentMethod"],
  金銭条件1_料率: ["paymentCondition1Rate", "payment_condition_1_rate", "rate"],
  金銭条件1_計算期間: ["paymentCondition1Period", "payment_condition_1_period", "period"],
  金銭条件1_MG_AG: ["paymentCondition1Guarantee", "payment_condition_1_guarantee", "minimumGuarantee"],
  金銭条件1_支払条件: ["paymentCondition1Terms", "payment_condition_1_terms", "paymentTerms"],
  金銭条件1_計算式: ["paymentCondition1Formula", "payment_condition_1_formula", "calculation"],
  金銭条件1_補足条件: ["paymentCondition1Note", "payment_condition_1_note", "note"],
  金銭条件1_通貨: ["paymentCondition1Currency", "payment_condition_1_currency", "currency"],
  金銭条件2_見出し: ["paymentCondition2Title", "payment_condition_2_title"],
  金銭条件2_地域: ["paymentCondition2Region", "payment_condition_2_region"],
  金銭条件2_言語: ["paymentCondition2Language", "payment_condition_2_language"],
  金銭条件2_計算方式: ["paymentCondition2Method", "payment_condition_2_method"],
  金銭条件2_分配率: ["paymentCondition2ShareRate", "payment_condition_2_share_rate", "shareRate"],
  金銭条件2_MG_AG: ["paymentCondition2Guarantee", "payment_condition_2_guarantee"],
  金銭条件2_支払条件: ["paymentCondition2Terms", "payment_condition_2_terms"],
  金銭条件2_計算式: ["paymentCondition2Formula", "payment_condition_2_formula"],
  金銭条件2_計算式注記: ["paymentCondition2FormulaNote", "payment_condition_2_formula_note"],
  金銭条件2_補足条件: ["paymentCondition2Note", "payment_condition_2_note"],
  金銭条件2_概要: ["paymentCondition2Summary", "payment_condition_2_summary"],
  金銭条件2_通貨: ["paymentCondition2Currency", "payment_condition_2_currency"],
  金銭条件3_見出し: ["paymentCondition3Title", "payment_condition_3_title"],
  金銭条件3_地域: ["paymentCondition3Region", "payment_condition_3_region"],
  金銭条件3_言語: ["paymentCondition3Language", "payment_condition_3_language"],
  金銭条件3_計算方式: ["paymentCondition3Method", "payment_condition_3_method"],
  金銭条件3_料率: ["paymentCondition3Rate", "payment_condition_3_rate"],
  金銭条件3_MG_AG: ["paymentCondition3Guarantee", "payment_condition_3_guarantee"],
  金銭条件3_支払条件: ["paymentCondition3Terms", "payment_condition_3_terms"],
  金銭条件3_計算式: ["paymentCondition3Formula", "payment_condition_3_formula"],
  金銭条件3_計算式注記: ["paymentCondition3FormulaNote", "payment_condition_3_formula_note"],
  金銭条件3_補足条件: ["paymentCondition3Note", "payment_condition_3_note"],
  金銭条件3_概要: ["paymentCondition3Summary", "payment_condition_3_summary"],
  金銭条件3_通貨: ["paymentCondition3Currency", "payment_condition_3_currency"]
};

const issueTypeByTemplateKey: Record<string, string> = {
  template_service_basic: "\u696d\u52d9\u59d4\u8a17",
  template_license_basic: "\u30e9\u30a4\u30bb\u30f3\u30b9\u5951\u7d04",
  template_ledger_v5__1_: "\u30e9\u30a4\u30bb\u30f3\u30b9\u5951\u7d04",
  template_nda: "NDA",
  template_order: "\u767a\u6ce8\u66f8",
  template_order_planning: "\u4f01\u753b\u767a\u6ce8\u66f8",
  template_sales_buyer: "\u58f2\u8cb7\u5951\u7d04\uff08\u8cb7\u624b\uff09",
  template_sales_seller_credit: "\u58f2\u8cb7\u5951\u7d04\uff08\u58f2\u624b\u30fb\u639b\u58f2\u308a\uff09",
  template_sales_seller_standard: "\u58f2\u8cb7\u5951\u7d04\uff08\u58f2\u624b\u30fb\u6a19\u6e96\uff09",
  template_inspection_report: "\u7d0d\u54c1\u30ea\u30af\u30a8\u30b9\u30c8",
  template_royalty_report: "\u7d0d\u54c1\u30ea\u30af\u30a8\u30b9\u30c8",
  template_revenue_share_report: "\u7d0d\u54c1\u30ea\u30af\u30a8\u30b9\u30c8",
  template_payment_notice: "\u7d0d\u54c1\u30ea\u30af\u30a8\u30b9\u30c8"
};

const paymentTypeByTemplateKey: Record<string, string> = {
  template_inspection_report: "INSPECTION",
  template_royalty_report: "ROYALTY",
  template_revenue_share_report: "REVENUE_SHARE"
};

export class DocumentService {
  constructor(
    private readonly tmpDir: string,
    private readonly templateDir: string,
    private readonly definitionsDir: string = path.join(process.cwd(), "templates", "definitions")
  ) {}

  async generate(issue: IssueRecord): Promise<DocumentRecord> {
    await mkdir(this.tmpDir, { recursive: true });

    const payload = this.normalizeObject(issue.payload);
    const id = `doc-${Date.now()}`;
    const fileStem = `${issue.issueKey}-${issue.templateKey}-${Date.now()}`;
    const htmlPath = path.join(this.tmpDir, `${fileStem}.html`);
    const pdfPath = path.join(this.tmpDir, `${fileStem}.pdf`);
    const contractNo =
      issue.contractNo ??
      this.asNonEmptyString(
        payload.contractNo ??
          payload.orderNo ??
          payload.order_no ??
          payload.noticeId ??
          payload.notice_id ??
          payload.CONTRACT_NO ??
          payload.ORDER_NO
      ) ??
      this.makeContractNo(issue.templateKey);
    const fields = Object.fromEntries(
      Object.entries(issue.payload).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value, null, 2)
      ])
    );
    const plan = this.resolveTemplatePlan(issue);
    const componentHtmlPaths: string[] = [];
    const componentPdfPaths: string[] = [];

    for (const templateFile of plan.templateFiles) {
      const componentHtmlPath =
        plan.templateFiles.length === 1
          ? htmlPath
          : path.join(this.tmpDir, `${fileStem}-${path.parse(templateFile).name}.html`);
      const componentPdfPath =
        plan.templateFiles.length === 1
          ? pdfPath
          : path.join(this.tmpDir, `${fileStem}-${path.parse(templateFile).name}.pdf`);
      const context = await this.buildTemplateContext(issue, contractNo, {
        templateFile,
        issueType: plan.issueType,
        deliveryType: plan.deliveryType,
        vendorType: plan.vendorType,
        hasBaseContract: plan.hasBaseContract
      });

      const html = await this.renderTemplateFile(
        templateFile,
        issue,
        contractNo,
        fields,
        context,
        this.fileNameToTemplateKey(templateFile)
      );
      await writeFile(componentHtmlPath, html, "utf8");
      await this.writePdf(componentPdfPath, componentHtmlPath, issue, contractNo, fields);
      componentHtmlPaths.push(componentHtmlPath);
      componentPdfPaths.push(componentPdfPath);
    }

    if (componentPdfPaths.length > 1) {
      await this.mergePdfFiles(componentPdfPaths, pdfPath);
    }

    return {
      id,
      issueId: issue.id,
      issueKey: issue.issueKey,
      templateKey: issue.templateKey,
      fileName: `${fileStem}.pdf`,
      htmlPath: componentHtmlPaths[0] ?? htmlPath,
      pdfPath,
      driveFolderName: this.buildDriveFolderName(issue, contractNo),
      driveStatus: "pending",
      contractNo,
      createdAt: new Date().toISOString()
    };
  }

  async mergePdfDocuments(pdfPaths: string[], outputFileName: string): Promise<string> {
    await mkdir(this.tmpDir, { recursive: true });
    const outputPdfPath = path.join(this.tmpDir, outputFileName);
    await this.mergePdfFiles(pdfPaths, outputPdfPath);
    return outputPdfPath;
  }

  private resolveTemplatePlan(issue: IssueRecord): TemplatePlan {
    const payload = this.normalizeObject(issue.payload);
    const issueType =
      this.asNonEmptyString(payload.issueType ?? payload.issue_type ?? payload.backlogIssueType) ??
      issueTypeByTemplateKey[issue.templateKey] ??
      issue.templateKey;
    const deliveryType = this.normalizePaymentType(
      this.asNonEmptyString(payload.deliveryType ?? payload.delivery_type ?? payload.paymentType ?? payload.payment_type) ??
        paymentTypeByTemplateKey[issue.templateKey] ??
        null
    );
    const vendorType = this.normalizeVendorType(payload);
    const hasBaseContract = this.inferHasBaseContract(payload);

    if (issue.templateKey === "template_order_planning" || issueType === "\u4f01\u753b\u767a\u6ce8\u66f8") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_order_planning.html", ...(hasBaseContract ? [] : ["terms_spot_2026.html"])]
      };
    }

    if (issue.templateKey === "template_order" || issueType === "\u767a\u6ce8\u66f8") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_order.html", ...(hasBaseContract ? [] : ["terms_spot_2026.html"])]
      };
    }

    if (
      issue.templateKey === "template_license_basic" ||
      issue.templateKey === "template_ledger_v5__1_" ||
      issueType === "\u30e9\u30a4\u30bb\u30f3\u30b9\u5951\u7d04"
    ) {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_license_basic.html", "template_ledger_v5__1_.html"]
      };
    }

    if (deliveryType === "INSPECTION") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_inspection_report.html", "template_payment_notice.html"]
      };
    }

    if (deliveryType === "ROYALTY") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_royalty_report.html", "template_payment_notice.html"]
      };
    }

    if (deliveryType === "REVENUE_SHARE") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_revenue_share_report.html", "template_payment_notice.html"]
      };
    }

    if (issueType === "\u58f2\u8cb7\u5951\u7d04\uff08\u8cb7\u624b\uff09") {
      return { issueType, deliveryType, vendorType, hasBaseContract, templateFiles: ["template_sales_buyer.html"] };
    }

    if (issueType === "\u58f2\u8cb7\u5951\u7d04\uff08\u58f2\u624b\u30fb\u639b\u58f2\u308a\uff09") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_sales_seller_credit.html"]
      };
    }

    if (issueType === "\u58f2\u8cb7\u5951\u7d04\uff08\u58f2\u624b\u30fb\u6a19\u6e96\uff09") {
      return {
        issueType,
        deliveryType,
        vendorType,
        hasBaseContract,
        templateFiles: ["template_sales_seller_standard.html"]
      };
    }

    const template = templateCatalog.find((item) => item.key === issue.templateKey);
    return {
      issueType,
      deliveryType,
      vendorType,
      hasBaseContract,
      templateFiles: [template?.fileName ?? `${issue.templateKey}.html`]
    };
  }

  private async writePdf(
    pdfPath: string,
    htmlPath: string,
    issue: IssueRecord,
    contractNo: string,
    fields: Record<string, string>
  ): Promise<void> {
    const chromePath = await this.resolveChromePath();
    if (!chromePath) {
      throw new Error("Chrome or Edge was not found for PDF generation.");
    }

    const absolutePdfPath = path.resolve(pdfPath);
    const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;

    try {
      await execFileAsync(chromePath, [
        "--headless=new",
        "--disable-gpu",
        "--allow-file-access-from-files",
        "--no-pdf-header-footer",
        `--print-to-pdf=${absolutePdfPath}`,
        fileUrl
      ]);
    } catch {
      const fallbackHtml = fallbackHtmlTemplate({
        title: issue.title,
        issueKey: issue.issueKey,
        status: issue.status,
        contractNo,
        fields
      });
      await writeFile(htmlPath, fallbackHtml, "utf8");
      throw new Error("Failed to print rendered HTML to PDF.");
    }
  }

  private async mergePdfFiles(componentPdfPaths: string[], outputPdfPath: string): Promise<void> {
    const merged = await PDFDocument.create();
    for (const componentPdfPath of componentPdfPaths) {
      const source = await PDFDocument.load(await readFile(componentPdfPath));
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    }
    await writeFile(outputPdfPath, await merged.save());
  }

  private makeContractNo(templateKey: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const serial = String(now.getTime()).slice(-4);
    const prefix = templateKey.includes("order") ? "PO" : templateKey.includes("license") ? "LIC" : "C";
    return `${prefix}-${year}-${serial}`;
  }

  private buildDriveFolderName(issue: IssueRecord, contractNo: string): string {
    const revision = Number(
      issue.payload.revision_no ?? issue.payload.revisionNo ?? issue.payload.counterparty_revision_no ?? 1
    );
    const suffix = Number.isFinite(revision) && revision > 1 ? `_rev${revision}` : "";
    return `${contractNo}_${issue.issueKey}${suffix}`;
  }

  private async renderTemplateFile(
    templateFile: string,
    issue: IssueRecord,
    contractNo: string,
    fields: Record<string, string>,
    context: Record<string, unknown>,
    templateKey: string
  ): Promise<string> {
    try {
      const raw = await this.readTemplateText(path.join(this.templateDir, templateFile));
      const prepared = this.prepareTemplate(raw, templateFile);
      const compiled = Handlebars.compile(this.ensureHtmlDocument(prepared));
      return compiled(context);
    } catch {
      if (templateFile === "template_payment_notice.html") {
        return this.renderCompatPaymentNoticeTemplate(context);
      }
      const template = templateCatalog.find((item) => item.key === templateKey);
      return fallbackHtmlTemplate({
        title: `${issue.title} (${template?.name ?? templateFile})`,
        issueKey: issue.issueKey,
        status: issue.status,
        contractNo,
        fields
      });
    }
  }

  private prepareTemplate(raw: string, templateFile: string): string {
    if (templateFile !== "template_order.html" && templateFile !== "template_order_planning.html") {
      return raw;
    }

    // Legacy order templates contained invalid mixed EJS/Handlebars fragments.
    // New templates are already valid Handlebars and should pass through unchanged.
    if (!raw.includes("1 && items.some") && !raw.includes("for (var i=0; i<items.length; i++)")) {
      return raw;
    }

    return raw
      .replace(/\{ORDER_DATE_DAY\}\}/g, "{{ORDER_DATE_DAY}}")
      .replace(
        /<tr>\s*<th>[^<]*<\/th>\s*<td>\s*1 && items\.some[\s\S]*?\{\{\/if\}\}\s*<\/td>\s*<\/tr>/,
        `<tr>
      <th>&#25903;&#25173;&#26465;&#20214;</th>
      <td>{{#if PAYMENT_TERMS}}{{PAYMENT_TERMS}}{{else}}&#21029;&#36884;&#21332;&#35696;&#12398;&#12358;&#12360;&#23450;&#12417;&#12414;&#12377;&#12290;{{/if}}</td>
    </tr>`
      )
      .replace(
        /<tbody>\s*\{\{#if items\}\}[\s\S]*?\{\{else\}\}[\s\S]*?\{\{\/if\}\}\s*<\/tbody>/,
        `<tbody>
      {{#if items}}
        {{#each items}}
        <tr>
          <td class="center">{{add @index 1}}</td>
          <td>{{#if item_name}}{{item_name}}{{else}}{{name}}{{/if}}</td>
          <td>{{#if detailText}}{{detailText}}{{else}}{{spec}}{{/if}}</td>
          <td class="center">{{#if payment_method_display}}{{payment_method_display}}{{else}}{{../PAYMENT_METHOD}}{{/if}}</td>
          <td class="center">{{#if qty}}{{qty}}{{else}}{{thisTimeQuantity}}{{/if}}</td>
          <td class="right">&#165; {{#if amount}}{{formatCurrency amount}}{{else}}0{{/if}}</td>
        </tr>
        {{/each}}
      {{else}}
        <tr>
          <td class="center">1</td>
          <td>{{ITEM_NAME}}</td>
          <td>{{SPECIAL_TERMS}}</td>
          <td class="center">{{PAYMENT_METHOD}}</td>
          <td class="center">1</td>
          <td class="right">&#165; {{formatCurrency grandTotalExTax}}</td>
        </tr>
      {{/if}}
    </tbody>`
      );
  }

  private renderCompatPaymentNoticeTemplate(context: Record<string, unknown>): string {
    const template = Handlebars.compile(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>{{documentLabel}}</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    body { font-family: "Yu Gothic", Meiryo, sans-serif; color: #111; font-size: 10pt; line-height: 1.5; margin: 0; }
    * { box-sizing: border-box; }
    .header { border-bottom: 2px solid #111; margin-bottom: 16px; padding-bottom: 10px; }
    h1 { margin: 0 0 6px; font-size: 20pt; }
    .muted { color: #555; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #cfcfcf; padding: 8px 10px; vertical-align: top; }
    th { width: 28%; background: #f3f3f3; text-align: left; }
    .amount { font-size: 16pt; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{documentLabel}}</h1>
    <div class="muted">Issue: {{ISSUE_KEY}} / Notice: {{NOTICE_ID}}</div>
  </div>
  <table>
    <tr><th>&#21462;&#24341;&#20808;</th><td>{{VENDOR_NAME}}</td></tr>
    <tr><th>&#20303;&#25152;</th><td>{{VENDOR_ADDRESS}}</td></tr>
    <tr><th>&#25903;&#25173;&#31278;&#21029;</th><td>{{paymentLabel}}</td></tr>
    <tr><th>&#21462;&#24341;&#21306;&#20998;</th><td>{{vendorLabel}}</td></tr>
    <tr><th>&#25903;&#25173;&#26085;</th><td>{{PAYMENT_DATE}}</td></tr>
    <tr><th>&#37329;&#38989;</th><td class="amount">&#165; {{formatCurrency grandTotalExTax}}</td></tr>
    <tr><th>&#20633;&#32771;</th><td>{{REMARKS}}</td></tr>
  </table>
</body>
</html>`);

    const paymentType = String(context.payment_type ?? context.PAYMENT_TYPE ?? "");
    const vendorType = String(context.vendor_type ?? context.VENDOR_TYPE ?? "");
    const paymentLabel =
      paymentType === "ROYALTY"
        ? "\u5229\u7528\u8a31\u8afe\u6599\u5831\u544a"
        : paymentType === "REVENUE_SHARE"
          ? "\u30ec\u30d9\u30cb\u30e5\u30fc\u30b7\u30a7\u30a2\u5831\u544a"
          : "\u691c\u53ce\u30fb\u652f\u6255\u901a\u77e5";
    const vendorLabel = vendorType === "INDIV" ? "\u500b\u4eba" : "\u6cd5\u4eba";

    return template({
      ...context,
      documentLabel: "\u652f\u6255\u901a\u77e5\u66f8 \u517c \u4ed5\u5165\u660e\u7d30\u66f8",
      paymentLabel,
      vendorLabel
    });
  }

  private ensureHtmlDocument(raw: string): string {
    const sanitized = raw.replace(/^<!--[\s\S]*?-->\s*/u, "");
    if (/<html[\s>]/i.test(sanitized)) {
      return sanitized;
    }
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Template Preview</title></head><body>${sanitized}</body></html>`;
  }

  private async readTemplateText(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
  }

  private async buildTemplateContext(
    issue: IssueRecord,
    contractNo: string,
    options: ContextOptions
  ): Promise<Record<string, unknown>> {
    const payload = this.normalizeObject(issue.payload);
    const hasMultipleItems = Array.isArray(payload.items) && payload.items.length > 1;
    const normalizedItems = this.normalizeItems(payload.items, hasMultipleItems);
    const grandTotalExTax = normalizedItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const remarksFixed = this.buildFixedRemarks(payload, normalizedItems);
    const remarksFree =
      this.asNonEmptyString(payload.remarksFree ?? payload.remarks_free ?? payload.freeRemarks ?? payload.free_remarks) ??
      this.asNonEmptyString(payload.remarks ?? payload.notes ?? payload.memo) ??
      "";
    const paymentMethodDisplay =
      this.asNonEmptyString(
        payload.paymentMethod ?? payload.payment_method ?? payload.payMethod ?? payload.pay_method ?? payload.PAYMENT_METHOD
      ) ?? this.collectUniqueValues(normalizedItems, ["payment_method_display", "pay_method", "payMethod"]);
    const rightsOwnerDisplay =
      this.asNonEmptyString(
        payload.rightsOwner ??
          payload.rights_owner ??
          payload.intellectualPropertyOwner ??
          payload.ipOwner ??
          payload.copyrightOwner
      ) ?? this.collectUniqueValues(normalizedItems, ["rights_owner_display", "rights_owner", "ip_owner", "copyright_owner"]);
    const paymentType =
      options.deliveryType ??
      this.normalizePaymentType(
        this.asNonEmptyString(payload.paymentType ?? payload.payment_type ?? payload.deliveryType ?? payload.delivery_type)
      );
    const issueDateDisplay =
      this.asNonEmptyString(payload.issueDate ?? payload.issue_date ?? payload.noticeDate ?? payload.notice_date) ??
      this.formatIssueDate(issue.createdAt);
    const paymentDueDate =
      this.asNonEmptyString(payload.paymentDueDate ?? payload.payment_due_date ?? payload.paymentDate ?? payload.payment_date) ??
      "";
    const withholdingTax = this.toNumber(payload.withholdingTax ?? payload.withholding_tax) ?? 0;
    const expenseAmount = this.toNumber(payload.expenseAmount ?? payload.expense_amount) ?? 0;
    const explicitTotalWithTax = this.toNumber(payload.totalWithTax ?? payload.total_with_tax);
    const explicitPaymentAmount = this.toNumber(payload.paymentAmount ?? payload.payment_amount);
    const totalNontax = this.toNumber(payload.totalNontax ?? payload.total_nontax ?? payload.nonTaxTotal ?? payload.non_tax_total) ?? 0;
    const taxRateRaw = this.toNumber(payload.taxRate ?? payload.tax_rate ?? 10) ?? 10;
    const taxRate = taxRateRaw > 1 ? taxRateRaw / 100 : taxRateRaw;
    const totalWithTax = explicitTotalWithTax ?? Math.round((grandTotalExTax + expenseAmount) * (1 + taxRate));
    const paymentAmount = explicitPaymentAmount ?? totalWithTax - withholdingTax;
    const vendorSuffix =
      this.asNonEmptyString(payload.vendorSuffix ?? payload.vendor_suffix) ?? (options.vendorType === "INDIV" ? "様" : "御中");

    const context: Record<string, unknown> = {
      ...payload,
      ...this.expandUppercaseKeys(payload),
      items: normalizedItems,
      d: {},
      ISSUE_KEY: issue.issueKey,
      issueKey: issue.issueKey,
      DOCUMENT_TITLE: issue.title,
      title: issue.title,
      status: issue.status,
      CONTRACT_NO: contractNo,
      ORDER_NO: contractNo,
      NOTICE_ID: contractNo,
      PARTY_A_NAME: payload.partyAName ?? payload.companyName ?? "\u682a\u5f0f\u4f1a\u793e\u30a2\u30fc\u30af\u30e9\u30a4\u30c8",
      PARTY_A_ADDRESS:
        payload.partyAAddress ??
        payload.companyAddress ??
        "\u6771\u4eac\u90fd\u5343\u4ee3\u7530\u533a\u795e\u7530\u5c0f\u5ddd\u753a\uff11\uff0d\uff12\u3000\u98a8\u96f2\u5802\u30d3\u30eb\u3000\uff12\u968e",
      PARTY_A_REP:
        payload.partyARepresentative ??
        payload.companyRepresentative ??
        "\u4ee3\u8868\u53d6\u7de0\u5f79 \u9752\u67f3\u3000\u660c\u884c",
      PARTY_A_REPRESENTATIVE:
        payload.partyARepresentative ??
        payload.partyARep ??
        payload.companyRepresentative ??
        payload.companyRep ??
        "\u4ee3\u8868\u53d6\u7de0\u5f79 \u9752\u67f3\u3000\u660c\u884c",
      PARTY_A_IS_CORPORATION: payload.partyAIsCorporation ?? payload.companyIsCorporation ?? true,
      PARTY_B_NAME:
        payload.vendorName ?? payload.vendor_name ?? payload.partnerName ?? payload.partner_name ?? "",
      PARTY_B_ADDRESS:
        payload.vendorAddress ?? payload.vendor_address ?? payload.partnerAddress ?? payload.partner_address ?? "",
      PARTY_B_REP:
        payload.vendorRepresentative ??
        payload.vendor_representative ??
        payload.vendorRep ??
        payload.vendor_rep ??
        payload.partnerRepresentative ??
        payload.partner_representative ??
        "",
      PARTY_B_REPRESENTATIVE:
        payload.vendorRepresentative ??
        payload.vendor_representative ??
        payload.vendorRep ??
        payload.vendor_rep ??
        payload.partnerRepresentative ??
        payload.partner_representative ??
        "",
      STAFF_DEPARTMENT: payload.staffDepartment ?? payload.staff_department ?? "",
      STAFF_NAME: payload.staffName ?? issue.requester,
      STAFF_EMAIL: payload.staffEmail ?? "",
      STAFF_PHONE: payload.staffPhone ?? "",
      SENDER_NAME: payload.senderName ?? payload.sender_name ?? payload.partyAName ?? payload.companyName ?? "\u682a\u5f0f\u4f1a\u793e\u30a2\u30fc\u30af\u30e9\u30a4\u30c8",
      SENDER_ZIP: payload.senderZip ?? payload.sender_zip ?? "101-0052",
      SENDER_ADDRESS:
        payload.senderAddress ??
        payload.sender_address ??
        payload.partyAAddress ??
        payload.companyAddress ??
        "\u6771\u4eac\u90fd\u5343\u4ee3\u7530\u533a\u795e\u7530\u5c0f\u5ddd\u753a\uff11\uff0d\uff12\u3000\u98a8\u96f2\u5802\u30d3\u30eb\u3000\uff12\u968e",
      SENDER_DEPT: payload.senderDept ?? payload.sender_dept ?? payload.staffDepartment ?? payload.staff_department ?? "",
      PAYMENT_METHOD: paymentMethodDisplay ?? "",
      PAYMENT_METHOD_DISPLAY: paymentMethodDisplay ?? "",
      RIGHTS_OWNER: rightsOwnerDisplay ?? "",
      RIGHTS_OWNER_DISPLAY: rightsOwnerDisplay ?? "",
      INTELLECTUAL_PROPERTY_OWNER: rightsOwnerDisplay ?? "",
      PAYMENT_TYPE: paymentType ?? "",
      payment_type: paymentType ?? "",
      VENDOR_TYPE: options.vendorType,
      vendor_type: options.vendorType,
      ISSUE_TYPE: options.issueType,
      issue_type: options.issueType,
      HAS_BASE_CONTRACT: options.hasBaseContract,
      has_base_contract: options.hasBaseContract,
      SHOW_ORDER_SIGN_SECTION: this.resolveBooleanFlag(
        payload.showOrderSignSection ?? payload.show_order_sign_section ?? payload.SHOW_ORDER_SIGN_SECTION,
        true
      ),
      SHOW_SIGN_SECTION: this.resolveBooleanFlag(
        payload.showSignSection ?? payload.show_sign_section ?? payload.SHOW_SIGN_SECTION,
        false
      ),
      hasMultipleItems,
      summaryDeliveryDate: hasMultipleItems
        ? "業務明細参照"
        : this.collectFirstValue(normalizedItems, ["delivery_date_display", "deliveryDate", "delivery_date"]) ??
          this.asNonEmptyString(payload.deliveryDate ?? payload.delivery_date ?? payload.DELIVERY_DATE) ??
          "",
      summaryPaymentTerms: hasMultipleItems
        ? "業務明細参照"
        : this.collectFirstValue(normalizedItems, ["payment_terms_display", "paymentTerms", "payment_terms", "paymentDate"]) ??
          this.asNonEmptyString(payload.paymentTerms ?? payload.payment_terms ?? payload.PAYMENT_TERMS) ??
          "",
      REMARKS_FIXED: remarksFixed,
      REMARKS_FREE: remarksFree,
      REMARKS: this.mergeRemarkBlocks(remarksFixed, remarksFree),
      ISSUE_DATE: issueDateDisplay,
      issue_date: issueDateDisplay,
      notice_date: issueDateDisplay,
      PAYMENT_DATE: paymentDueDate,
      payment_date: paymentDueDate,
      payment_due_date: paymentDueDate,
      totalWithTax,
      paymentAmount,
      expenseAmount,
      withholdingTax,
      showWithholdingNote: withholdingTax > 0 && options.vendorType === "INDIV",
      withholdingRateLabel: this.asNonEmptyString(payload.withholdingRateLabel ?? payload.withholding_rate_label) ?? "10.21%",
      vendorSuffix,
      inspections: paymentType === "INSPECTION" ? normalizedItems : null,
      royalties: paymentType === "ROYALTY" ? normalizedItems : null,
      revenue_shares: paymentType === "REVENUE_SHARE" ? normalizedItems : null,
      revshare_basis:
        this.asNonEmptyString(payload.revshareBasis ?? payload.revshare_basis ?? payload.calculationBasis ?? payload.calculation_basis) ??
        "",
      revshare_note:
        this.asNonEmptyString(payload.revshareNote ?? payload.revshare_note ?? payload.specialNote ?? payload.special_note) ?? "",
      TOTAL_NONTAX: totalNontax,
      TOTAL_NET: grandTotalExTax,
      MINIMUM_GUARANTEE: this.toNumber(payload.minimumGuarantee ?? payload.minimum_guarantee) ?? "",
      SUBTOTAL_INSPECTION: paymentType === "INSPECTION" ? grandTotalExTax : 0,
      SUBTOTAL_ROYALTY: paymentType === "ROYALTY" ? grandTotalExTax : 0,
      SUBTOTAL_REVSHARE: paymentType === "REVENUE_SHARE" ? grandTotalExTax : 0,
      licensor名: payload.vendorName ?? payload.vendor_name ?? payload.partnerName ?? payload.partner_name ?? "",
      licensor_住所: payload.vendorAddress ?? payload.vendor_address ?? payload.partnerAddress ?? payload.partner_address ?? "",
      licensor_氏名会社名:
        payload.vendorName ?? payload.vendor_name ?? payload.partnerName ?? payload.partner_name ?? "",
      licensor_代表者名:
        payload.vendorRepresentative ??
        payload.vendor_representative ??
        payload.vendorRep ??
        payload.vendor_rep ??
        payload.partnerRepresentative ??
        payload.partner_representative ??
        "",
      LICENSOR_IS_CORPORATION:
        payload.vendorIsCorporation ??
        payload.vendor_is_corporation ??
        payload.isCorporation ??
        payload.is_corporation ??
        true,
      \u53f0\u5e33ID: contractNo,
      \u5951\u7d04\u66f8\u756a\u53f7: contractNo,
      \u767a\u884c\u65e5: issueDateDisplay,
      \u57fa\u672c\u5951\u7d04\u540d:
        payload.baseContractName ?? payload.basicContractName ?? payload.masterContractRef ?? payload.master_contract_ref ?? issue.title,
      \u30e9\u30a4\u30bb\u30f3\u30b9\u7a2e\u5225\u540d: payload.licenseTypeName ?? payload.license_type_name ?? issue.title,
      \u8a31\u8afe\u958b\u59cb\u65e5:
        payload.licenseStartDate ?? payload.license_start_date ?? payload.contractDate ?? payload.effectiveDate ?? issueDateDisplay,
      \u8a31\u8afe\u671f\u9593\u6ce8\u8a18:
        payload.licensePeriodNote ?? payload.license_period_note ?? payload.contractPeriod ?? payload.contract_period ?? "",
      \u539f\u8457\u4f5c\u7269\u540d: payload.originalWork ?? payload.original_work ?? "",
      \u539f\u8457\u4f5c\u7269\u88dc\u8a18: payload.originalWorkNote ?? payload.original_work_note ?? "",
      \u5bfe\u8c61\u88fd\u54c1\u4e88\u5b9a\u540d: payload.projectTitle ?? payload.project_title ?? payload.productName ?? payload.product_name ?? "",
      \u7d20\u6750\u540d: payload.materialName ?? payload.material_name ?? "",
      \u7d20\u6750\u756a\u53f7: payload.materialNo ?? payload.material_no ?? "",
      \u7d20\u6750\u6a29\u5229\u8005:
        payload.materialRightsHolder ?? payload.material_rights_holder ?? payload.rightsOwner ?? payload.rights_owner ?? "",
      \u76e3\u4fee\u8005: payload.supervisor ?? payload.reviewSupervisor ?? "",
      \u7279\u8a18\u4e8b\u9805_\u672c\u6587:
        payload.specialTerms ?? payload.special_terms ?? payload.specialNote ?? payload.special_note ?? remarksFree,
      grandTotalExTax,
      totalFee: grandTotalExTax,
      totalExp: 0
    };

    this.applyDateFields(
      context,
      payload.contractDate ?? payload.effectiveDate ?? payload.orderDate ?? new Date().toISOString()
    );

    const definition = await this.loadDefinition(options.templateFile, this.fileNameToTemplateKey(options.templateFile));
    if (definition) {
      const sourceValues: Record<string, unknown> = { ...payload, ...context };
      for (const variable of definition.variables) {
        const value = this.resolveVariableValue(variable, sourceValues, issue, contractNo);
        if (value === undefined) {
          continue;
        }
        if (variable.arrayPrefix === "items") {
          context.items = normalizedItems;
          continue;
        }
        context[variable.name] = value;
        (context.d as Record<string, unknown>)[variable.name] = value;
        sourceValues[variable.name] = value;
      }
    }

    return context;
  }

  private normalizeItems(value: unknown, includeScheduleDetails = false): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => {
      const normalized = this.normalizeObject(item);
      const detailLines = [
        this.asNonEmptyString(normalized.detailText ?? normalized.spec),
        this.asNonEmptyString(normalized.deliveryDate ?? normalized.delivery_date)
          ? `納期: ${this.asNonEmptyString(normalized.deliveryDate ?? normalized.delivery_date)}`
          : null,
        includeScheduleDetails &&
        this.asNonEmptyString(normalized.paymentTerms ?? normalized.payment_terms ?? normalized.paymentDate ?? normalized.payment_date)
          ? `支払条件: ${
              this.asNonEmptyString(
                normalized.paymentTerms ?? normalized.payment_terms ?? normalized.paymentDate ?? normalized.payment_date
              )
            }`
          : null
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");

      return {
        ...normalized,
        ...this.expandUppercaseKeys(normalized),
        item_name: normalized.name ?? normalized.itemName ?? normalized.ITEM_NAME ?? "",
        detailText: detailLines,
        detail: normalized.detail ?? normalized.detailText ?? normalized.spec ?? detailLines,
        name: normalized.name ?? normalized.itemName ?? normalized.ITEM_NAME ?? "",
        date:
          normalized.date ??
          normalized.issueDate ??
          normalized.issue_date ??
          normalized.deliveryDate ??
          normalized.delivery_date ??
          "",
        amount:
          normalized.amount ??
          this.computeAmount(normalized.unitPrice ?? normalized.unit_price, normalized.thisTimeQuantity ?? normalized.quantity),
        unit_price:
          normalized.unitPrice ??
          normalized.unit_price ??
          this.computeUnitPrice(
            normalized.amount ??
              this.computeAmount(normalized.unitPrice ?? normalized.unit_price, normalized.thisTimeQuantity ?? normalized.quantity),
            normalized.qty ?? normalized.thisTimeQuantity ?? normalized.quantity
          ),
        baseAmount: normalized.baseAmount ?? normalized.baseamount ?? normalized.base_amount ?? normalized.salesAmount ?? "",
        category: normalized.category ?? normalized.spec ?? "",
        note: normalized.note ?? "",
        period: normalized.period ?? normalized.periodText ?? normalized.period_text ?? "",
        rate: normalized.rate ?? normalized.shareRate ?? normalized.share_rate ?? "",
        pay_method: normalized.payMethod ?? normalized.paymentMethod ?? normalized.payment_method ?? "",
        payment_method_display:
          normalized.paymentMethodDisplay ??
          normalized.paymentMethod ??
          normalized.payment_method ??
          normalized.payMethod ??
          normalized.pay_method ??
          "",
        rights_owner_display:
          normalized.rightsOwnerDisplay ??
          normalized.rightsOwner ??
          normalized.rights_owner ??
          normalized.intellectualPropertyOwner ??
          normalized.ipOwner ??
          normalized.copyrightOwner ??
          "",
        work_name: normalized.workName ?? normalized.work_name ?? normalized.name ?? normalized.itemName ?? "",
        period_text:
          normalized.periodText ??
          normalized.period_text ??
          normalized.period ??
          this.buildPeriodText(normalized.periodStart ?? normalized.period_start, normalized.periodEnd ?? normalized.period_end),
        trigger_type: normalized.triggerType ?? normalized.trigger_type ?? normalized.calculation ?? "",
        period_start: normalized.periodStart ?? normalized.period_start ?? "",
        period_end: normalized.periodEnd ?? normalized.period_end ?? "",
        share_rate: normalized.shareRate ?? normalized.share_rate ?? normalized.rate ?? "",
        deduction: normalized.deduction ?? "",
        deduction_note: normalized.deductionNote ?? normalized.deduction_note ?? "",
        qty: normalized.qty ?? normalized.thisTimeQuantity ?? normalized.quantity ?? 1,
        delivery_date_display: this.asNonEmptyString(normalized.deliveryDate ?? normalized.delivery_date) ?? "",
        payment_terms_display:
          this.asNonEmptyString(
            normalized.paymentTerms ?? normalized.payment_terms ?? normalized.paymentDate ?? normalized.payment_date
          ) ?? ""
      };
    });
  }

  private normalizePaymentType(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.toUpperCase();
    if (normalized.includes("INSPECTION") || normalized.includes("\u691c\u53ce")) {
      return "INSPECTION";
    }
    if (normalized.includes("ROYALTY") || normalized.includes("\u5229\u7528\u8a31\u8afe")) {
      return "ROYALTY";
    }
    if (normalized.includes("REVENUE") || normalized.includes("\u30ec\u30d9\u30cb\u30e5\u30fc")) {
      return "REVENUE_SHARE";
    }
    return normalized;
  }

  private normalizeVendorType(payload: Record<string, unknown>): "CORP" | "INDIV" {
    const raw = this.asNonEmptyString(payload.vendorType ?? payload.vendor_type);
    if (raw) {
      return raw.toUpperCase().includes("INDIV") ? "INDIV" : "CORP";
    }

    const corporationFlag = payload.isCorporation ?? payload.is_corporation ?? payload.vendorIsCorporation;
    if (corporationFlag === false || corporationFlag === "false" || corporationFlag === 0) {
      return "INDIV";
    }
    return "CORP";
  }

  private inferHasBaseContract(payload: Record<string, unknown>): boolean {
    const direct = payload.hasBaseContract ?? payload.has_base_contract ?? payload.baseContractExists;
    if (typeof direct === "boolean") {
      return direct;
    }
    if (typeof direct === "string") {
      return !["false", "0", "no", "off"].includes(direct.toLowerCase());
    }
    return Boolean(
      payload.masterContractRef ??
        payload.master_contract_ref ??
        payload.baseContractId ??
        payload.base_contract_id ??
        true
    );
  }

  private asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private collectUniqueValues(items: Record<string, unknown>[], keys: string[]): string | null {
    const values = new Set<string>();
    for (const item of items) {
      for (const key of keys) {
        const value = this.asNonEmptyString(item[key]);
        if (value) {
          values.add(value);
        }
      }
    }
    if (values.size === 0) {
      return null;
    }
    return Array.from(values).join(", ");
  }

  private collectFirstValue(items: Record<string, unknown>[], keys: string[]): string | null {
    for (const item of items) {
      for (const key of keys) {
        const value = this.asNonEmptyString(item[key]);
        if (value) {
          return value;
        }
      }
    }
    return null;
  }

  private buildFixedRemarks(payload: Record<string, unknown>, items: Record<string, unknown>[]): string {
    const rightsRemark = this.buildRightsRemark(payload, items);
    const lines = [
      this.asNonEmptyString(payload.contractPeriod ?? payload.contract_period)
        ? `契約期間：${this.asNonEmptyString(payload.contractPeriod ?? payload.contract_period)}`
        : null,
      this.asNonEmptyString(payload.workStartDate ?? payload.work_start_date ?? payload.startDate ?? payload.start_date)
        ? `作業開始日：${
            this.asNonEmptyString(payload.workStartDate ?? payload.work_start_date ?? payload.startDate ?? payload.start_date)
          }`
        : null,
      this.asNonEmptyString(payload.transferFeePayer ?? payload.transfer_fee_payer ?? payload.TRANSFER_FEE_PAYER)
        ? `※ お振込手数料は${
            this.asNonEmptyString(payload.transferFeePayer ?? payload.transfer_fee_payer ?? payload.TRANSFER_FEE_PAYER)
          }負担とします。`
        : null,
      rightsRemark
        ? `知的財産権: ${rightsRemark}`
        : null
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  private mergeRemarkBlocks(...blocks: string[]): string {
    const lines: string[] = [];
    for (const block of blocks) {
      if (!block) {
        continue;
      }
      for (const line of block.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized || lines.includes(normalized)) {
          continue;
        }
        lines.push(normalized);
      }
    }
    return lines.join("\n");
  }

  private buildRightsRemark(payload: Record<string, unknown>, items: Record<string, unknown>[]): string | null {
    const rightsValues = new Set<string>();
    const itemRights = this.collectUniqueValues(items, [
      "rights_owner_display",
      "rightsOwner",
      "rights_owner",
      "intellectualPropertyOwner",
      "ipOwner",
      "copyrightOwner"
    ]);
    if (itemRights) {
      for (const part of itemRights.split(",").map((value) => value.trim()).filter(Boolean)) {
        rightsValues.add(part);
      }
    }
    const payloadRights = this.asNonEmptyString(
      payload.rightsOwner ??
        payload.rights_owner ??
        payload.intellectualPropertyOwner ??
        payload.ipOwner ??
        payload.copyrightOwner
    );
    if (payloadRights) {
      rightsValues.add(payloadRights);
    }

    if (rightsValues.size === 0) {
      return null;
    }

    const descriptions = Array.from(rightsValues).map((value) => {
      if (value.includes("発注者帰属")) {
        return "発注者帰属（全権譲渡（著作権法27条・28条含む）、譲渡代金は別途定めがない場合は報酬に含む）";
      }
      if (value.includes("受注者帰属")) {
        return "受注者帰属（別途利用許諾合意あり、当該合意がない場合は、利用許諾代金は報酬に含むものとする。）";
      }
      return value;
    });

    return descriptions.join(" / ");
  }

  private resolveBooleanFlag(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return defaultValue;
      }
      if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
      }
    }
    return defaultValue;
  }

  private computeAmount(unitPrice: unknown, quantity: unknown): number | string {
    const left = Number(unitPrice ?? 0);
    const right = Number(quantity ?? 0);
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return String(unitPrice ?? "");
    }
    return left * right;
  }

  private computeUnitPrice(amount: unknown, quantity: unknown): number | string {
    const total = Number(amount ?? 0);
    const qty = Number(quantity ?? 0);
    if (Number.isNaN(total) || Number.isNaN(qty) || qty === 0) {
      return String(amount ?? "");
    }
    return total / qty;
  }

  private buildPeriodText(start: unknown, end: unknown): string {
    const left = this.asNonEmptyString(start);
    const right = this.asNonEmptyString(end);
    if (left && right) {
      return `${left} ～ ${right}`;
    }
    return left ?? right ?? "";
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const normalized =
      typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private applyDateFields(context: Record<string, unknown>, value: unknown): void {
    const date = new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) {
      return;
    }

    context.CONTRACT_DATE = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    context.CONTRACT_DATE_YEAR = String(date.getFullYear());
    context.CONTRACT_DATE_MONTH = String(date.getMonth() + 1);
    context.CONTRACT_DATE_DAY = String(date.getDate());
    context.ORDER_DATE_YEAR = String(date.getFullYear());
    context.ORDER_DATE_MONTH = String(date.getMonth() + 1);
    context.ORDER_DATE_DAY = String(date.getDate());
    context.CONTRACT_DATE_FORMATTED = `${date.getFullYear()}\u5e74${date.getMonth() + 1}\u6708${date.getDate()}\u65e5`;
  }

  private resolveVariableValue(
    variable: TemplateVariableDefinition,
    payload: Record<string, unknown>,
    issue: IssueRecord,
    contractNo: string
  ): unknown {
    if (variable.arrayPrefix === "items") {
      return payload.items;
    }

    if (variable.source === "auto") {
      if (["ORDER_NO", "NOTICE_ID", "CONTRACT_NO", "契約書番号", "台帳ID"].includes(variable.name)) {
        return contractNo;
      }
      if (["発行日", "ISSUE_DATE", "notice_date"].includes(variable.name)) {
        return this.formatIssueDate(issue.createdAt);
      }
    }

    if (variable.source === "calc") {
      return this.readPayloadValue(payload, variable.name, variable.name);
    }

    if (String(variable.source).startsWith("backlog.")) {
      const backlogKey = String(variable.source).replace(/^backlog\./, "");
      return this.readPayloadValue(payload, variable.name, backlogKey);
    }

    if (String(variable.source).startsWith("partner.")) {
      const partnerKey = String(variable.source).replace(/^partner\./, "");
      return this.readPayloadValue(payload, variable.name, partnerKey);
    }

    if (String(variable.source).startsWith("user.")) {
      return (
        this.readPayloadValue(payload, variable.name, String(variable.source).replace(/^user\./, "")) ??
        issue.requester ??
        issue.assignee
      );
    }

    if (String(variable.source).startsWith("fixed:company")) {
      return this.resolveFixedCompanyValue(variable.name, payload);
    }

    return this.readPayloadValue(payload, variable.name, variable.name.toLowerCase());
  }

  private resolveFixedCompanyValue(variableName: string, payload: Record<string, unknown>): unknown {
    const explicit = this.readPayloadValue(payload, variableName, variableName.toLowerCase());
    if (explicit !== undefined && explicit !== null && explicit !== "") {
      return explicit;
    }

    const fixedCompanyMap: Record<string, string[]> = {
      PARTY_A_NAME: ["partyAName", "companyName"],
      PARTY_A_ADDRESS: ["partyAAddress", "companyAddress"],
      PARTY_A_REP: ["partyARepresentative", "companyRepresentative"],
      PARTY_A_IS_CORPORATION: ["partyAIsCorporation", "companyIsCorporation"],
      SENDER_NAME: ["senderName", "companyName", "partyAName"],
      SENDER_ZIP: ["senderZip", "companyZip", "partyAZip"],
      SENDER_ADDRESS: ["senderAddress", "companyAddress", "partyAAddress"],
      licensee名: ["partyAName", "companyName"],
      licensee_住所: ["partyAAddress", "companyAddress"],
      licensee_氏名会社名: ["partyAName", "companyName"],
      licensee_代表者名: ["partyARepresentative", "companyRepresentative"],
      LICENSEE_IS_CORPORATION: ["partyAIsCorporation", "companyIsCorporation"]
    };

    const candidates = fixedCompanyMap[variableName] ?? [];
    for (const key of candidates) {
      const value = payload[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    const defaults: Record<string, string> = {
      PARTY_A_NAME: "株式会社アークライト",
      PARTY_A_IS_CORPORATION: "true",
      PARTY_A_ADDRESS: "東京都千代田区神田小川町１－２\n風雲堂ビル　２階",
      PARTY_A_REP: "代表取締役 青柳　昌行",
      SENDER_NAME: "株式会社アークライト",
      SENDER_ZIP: "101-0052",
      SENDER_ADDRESS: "東京都千代田区神田小川町１－２\n風雲堂ビル　２階",
      licensee名: "株式会社アークライト",
      licensee_住所: "東京都千代田区神田小川町１－２\n風雲堂ビル　２階",
      licensee_氏名会社名: "株式会社アークライト",
      licensee_代表者名: "代表取締役 青柳　昌行"
    };

    return defaults[variableName] ?? "";
  }

  private formatIssueDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  }

  private readPayloadValue(payload: Record<string, unknown>, variableName: string, sourceKey: string): unknown {
    const candidates = new Set<string>([
      variableName,
      sourceKey,
      this.toSnakeUpper(sourceKey),
      this.toCamel(sourceKey),
      this.toCamel(variableName),
      ...(variableAliases[variableName] ?? [])
    ]);

    for (const key of candidates) {
      if (key in payload && payload[key] !== undefined && payload[key] !== "") {
        return payload[key];
      }
    }

    return undefined;
  }

  private expandUppercaseKeys(input: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[this.toSnakeUpper(key)] = value;
    }
    return output;
  }

  private normalizeObject(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }

    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = Array.isArray(value)
        ? value.map((item) => (typeof item === "object" ? this.normalizeObject(item) : item))
        : value;
    }

    const customFields = Array.isArray(output.customFields) ? output.customFields : [];
    for (const item of customFields) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const field = item as { name?: unknown; value?: unknown };
      const name = typeof field.name === "string" ? field.name.trim() : "";
      if (!name) {
        continue;
      }
      output[name] = field.value;
      output[this.toCamel(name)] = field.value;
      output[this.toSnakeUpper(name)] = field.value;
    }
    return output;
  }

  private toSnakeUpper(input: string): string {
    return input
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[\s.-]+/g, "_")
      .toUpperCase();
  }

  private toCamel(input: string): string {
    return input
      .toLowerCase()
      .replace(/_([a-z0-9])/g, (_match, value: string) => value.toUpperCase());
  }

  private async loadDefinition(templateFile: string, templateKey: string): Promise<ManagedTemplateDefinition | null> {
    const guesses = [
      templateKey.replace(/^template_/, ""),
      path.parse(templateFile).name.replace(/^template_/, "")
    ];

    for (const guess of guesses) {
      try {
        return JSON.parse(
          await readFile(path.join(this.definitionsDir, `${guess}.json`), "utf8")
        ) as ManagedTemplateDefinition;
      } catch {
        continue;
      }
    }

    try {
      const definitionFiles = (await readdir(this.definitionsDir)).filter((file) => file.endsWith(".json"));
      for (const definitionFile of definitionFiles) {
        const definition = JSON.parse(
          await readFile(path.join(this.definitionsDir, definitionFile), "utf8")
        ) as ManagedTemplateDefinition;
        if (definition.templateFile === templateFile) {
          return definition;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private fileNameToTemplateKey(templateFile: string): string {
    const template = templateCatalog.find((item) => item.fileName === templateFile);
    if (template) {
      return template.key;
    }
    return path.parse(templateFile).name;
  }

  private async resolveChromePath(): Promise<string | null> {
    for (const candidate of chromeCandidates) {
      try {
        await readFile(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    return null;
  }
}
