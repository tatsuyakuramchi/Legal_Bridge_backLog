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
  ORDER_DATE_DAY: ["orderDateDay"]
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

    const id = `doc-${Date.now()}`;
    const fileStem = `${issue.issueKey}-${issue.templateKey}-${Date.now()}`;
    const htmlPath = path.join(this.tmpDir, `${fileStem}.html`);
    const pdfPath = path.join(this.tmpDir, `${fileStem}.pdf`);
    const contractNo = issue.contractNo ?? this.makeContractNo(issue.templateKey);
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
    const normalizedItems = this.normalizeItems(payload.items);
    const grandTotalExTax = normalizedItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
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
      PARTY_A_ADDRESS: payload.partyAAddress ?? payload.companyAddress ?? "\u6771\u4eac\u90fd\u5343\u4ee3\u7530\u533a\u795e\u7530\u5c0f\u5ddd\u753a1-1-1",
      PARTY_A_REP: payload.partyARepresentative ?? payload.companyRepresentative ?? "\u4ee3\u8868\u53d6\u7de0\u5f79 \u4f50\u85e4\u4e00\u90ce",
      STAFF_NAME: payload.staffName ?? issue.requester,
      STAFF_EMAIL: payload.staffEmail ?? "",
      STAFF_PHONE: payload.staffPhone ?? "",
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
      for (const variable of definition.variables) {
        const value = this.resolveVariableValue(variable, payload, issue, contractNo);
        if (value === undefined) {
          continue;
        }
        if (variable.arrayPrefix === "items") {
          context.items = normalizedItems;
          continue;
        }
        context[variable.name] = value;
        (context.d as Record<string, unknown>)[variable.name] = value;
      }
    }

    return context;
  }

  private normalizeItems(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => {
      const normalized = this.normalizeObject(item);
      return {
        ...normalized,
        ...this.expandUppercaseKeys(normalized),
        item_name: normalized.name ?? normalized.itemName ?? normalized.ITEM_NAME ?? "",
        detailText: normalized.detailText ?? normalized.spec ?? "",
        amount:
          normalized.amount ??
          this.computeAmount(normalized.unitPrice ?? normalized.unit_price, normalized.thisTimeQuantity ?? normalized.quantity),
        category: normalized.category ?? normalized.spec ?? "",
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
        qty: normalized.qty ?? normalized.thisTimeQuantity ?? normalized.quantity ?? 1
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

  private computeAmount(unitPrice: unknown, quantity: unknown): number | string {
    const left = Number(unitPrice ?? 0);
    const right = Number(quantity ?? 0);
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return String(unitPrice ?? "");
    }
    return left * right;
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

    if (variable.source === "auto" && ["ORDER_NO", "NOTICE_ID", "CONTRACT_NO"].includes(variable.name)) {
      return contractNo;
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
      return this.readPayloadValue(payload, variable.name, variable.name.toLowerCase()) ?? "";
    }

    return this.readPayloadValue(payload, variable.name, variable.name.toLowerCase());
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
