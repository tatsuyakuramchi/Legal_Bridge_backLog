import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DocumentService } from "../src/services/documentService.js";
import { IssueRecord } from "../src/types.js";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const outDir = path.join(rootDir, "tmp", "royalty-test-output");
  await mkdir(outDir, { recursive: true });

  const documentService = new DocumentService(outDir, path.join(rootDir, "templates"));
  const issue: IssueRecord = {
    id: `issue-${Date.now()}`,
    issueKey: `ROY-${String(Date.now()).slice(-6)}`,
    title: "利用許諾料報告書 テスト",
    requester: "倉持 達也",
    assignee: "local-app",
    templateKey: "template_royalty_report",
    status: "Draft",
    contractNo: `C-TEST-${Date.now()}`,
    payload: {
      issue_date: "2026年3月26日",
      vendorName: "株式会社テストライセンシー",
      vendor_name: "株式会社テストライセンシー",
      vendorInvoiceNum: "T1234567890123",
      vendor_invoice_num: "T1234567890123",
      total_nontax: 12000,
      items: [
        {
          date: "2026/03/01",
          name: "作品A",
          detail: "国内配信分",
          period_text: "2026年3月1日 - 2026年3月15日",
          qty: 1200,
          rate: "8%",
          amount: 96000,
          deduction: 6000,
          deduction_note: "返金対応分を控除"
        },
        {
          date: "2026/03/16",
          name: "作品B",
          detail: "海外配信分",
          period_text: "2026年3月16日 - 2026年3月31日",
          qty: 800,
          rate: "10%",
          amount: 120000,
          deduction: 0,
          deduction_note: ""
        }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const document = await documentService.generate(issue);
  const royaltyHtmlPath = path.join(outDir, `${path.parse(document.pdfPath).name}-template_royalty_report.html`);
  const html = await readFile(royaltyHtmlPath, "utf8");

  const checks = {
    period1: html.includes("2026年3月1日 - 2026年3月15日"),
    period2: html.includes("2026年3月16日 - 2026年3月31日"),
    deduction: html.includes("控除: ¥6,000"),
    deductionNote: html.includes("返金対応分を控除")
  };

  console.log(
    JSON.stringify(
      {
        pdfPath: document.pdfPath,
        htmlPath: royaltyHtmlPath,
        checks
      },
      null,
      2
    )
  );
}

await main();
