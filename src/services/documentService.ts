import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DocumentRecord, IssueRecord } from "../types.js";
import { templateCatalog } from "../templateCatalog.js";

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
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
});

Handlebars.registerHelper("formatDateTime", (value: unknown) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
});

Handlebars.registerHelper("add", (left: unknown, right: unknown) => Number(left ?? 0) + Number(right ?? 0));
Handlebars.registerHelper("invoiceRegistrationDisplay", (value: unknown) =>
  value ? "適格請求書発行事業者" : "免税事業者"
);

const htmlTemplate = Handlebars.compile(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>{{title}}</title>
    <style>
      body { font-family: sans-serif; margin: 40px; color: #172033; }
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

export class DocumentService {
  constructor(
    private readonly tmpDir: string,
    private readonly templateDir: string
  ) {}

  async generate(issue: IssueRecord): Promise<DocumentRecord> {
    await mkdir(this.tmpDir, { recursive: true });
    const id = `doc-${Date.now()}`;
    const fileStem = `${issue.issueKey}-${issue.templateKey}-${Date.now()}`;
    const htmlPath = path.join(this.tmpDir, `${fileStem}.html`);
    const pdfPath = path.join(this.tmpDir, `${fileStem}.pdf`);
    const contractNo = issue.contractNo ?? this.makeContractNo();

    const fields = Object.fromEntries(
      Object.entries(issue.payload).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value, null, 2)
      ])
    );

    const html = await this.renderTemplate(issue, contractNo, fields);

    await writeFile(htmlPath, html, "utf8");
    await this.writePdf(pdfPath, issue.title, issue.issueKey, contractNo, fields);

    return {
      id,
      issueId: issue.id,
      issueKey: issue.issueKey,
      templateKey: issue.templateKey,
      fileName: `${fileStem}.pdf`,
      htmlPath,
      pdfPath,
      driveFolderName: `${issue.issueKey}_${issue.templateKey}`,
      driveStatus: "pending",
      contractNo,
      createdAt: new Date().toISOString()
    };
  }

  private async writePdf(
    pdfPath: string,
    title: string,
    issueKey: string,
    contractNo: string,
    fields: Record<string, string>
  ): Promise<void> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const drawLine = (text: string, y: number, size = 11): number => {
      page.drawText(this.toAscii(text).slice(0, 100), {
        x: 40,
        y,
        size,
        font,
        color: rgb(0.1, 0.16, 0.24)
      });
      return y - (size + 8);
    };

    let y = 790;
    y = drawLine(title, y, 18);
    y = drawLine(`Issue: ${issueKey}`, y);
    y = drawLine(`Contract No: ${contractNo}`, y);
    y -= 8;

    for (const [key, value] of Object.entries(fields)) {
      if (y < 80) {
        y = pdf.addPage([595, 842]).getHeight() - 52;
      }
      y = drawLine(`${key}: ${value.replace(/\s+/g, " ").slice(0, 90)}`, y);
    }

    await writeFile(pdfPath, await pdf.save());
  }

  private makeContractNo(): string {
    const now = new Date();
    const year = now.getFullYear();
    const serial = String(now.getTime()).slice(-4);
    return `CN-${year}-${serial}`;
  }

  private toAscii(input: string): string {
    return input.replace(/[^\x20-\x7E]/g, "?");
  }

  private async renderTemplate(
    issue: IssueRecord,
    contractNo: string,
    fields: Record<string, string>
  ): Promise<string> {
    const template = templateCatalog.find((item) => item.key === issue.templateKey);
    if (!template) {
      return htmlTemplate({
        title: issue.title,
        issueKey: issue.issueKey,
        status: issue.status,
        contractNo,
        fields
      });
    }

    try {
      const raw = await readFile(path.join(this.templateDir, template.fileName), "utf8");
      const compiled = Handlebars.compile(this.ensureHtmlDocument(raw));
      return compiled({
        ...issue.payload,
        ISSUE_KEY: issue.issueKey,
        DOCUMENT_TITLE: issue.title,
        CONTRACT_NO: contractNo,
        status: issue.status,
        issueKey: issue.issueKey
      });
    } catch {
      return htmlTemplate({
        title: `${issue.title} (${template.name})`,
        issueKey: issue.issueKey,
        status: issue.status,
        contractNo,
        fields
      });
    }
  }

  private ensureHtmlDocument(raw: string): string {
    const sanitized = raw.replace(/^<!--[\s\S]*?-->\s*/u, "");
    if (/<html[\s>]/i.test(sanitized)) {
      return sanitized;
    }
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Template Preview</title></head><body>${sanitized}</body></html>`;
  }
}
