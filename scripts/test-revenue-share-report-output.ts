import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DocumentService } from "../src/services/documentService.js";
import { IssueRecord } from "../src/types.js";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const outDir = path.join(rootDir, "tmp", "revenue-share-test-output");
  await mkdir(outDir, { recursive: true });

  const documentService = new DocumentService(outDir, path.join(rootDir, "templates"));
  const issue: IssueRecord = {
    id: `issue-${Date.now()}`,
    issueKey: `REV-${String(Date.now()).slice(-6)}`,
    title: "業務委託報酬計算書 テスト",
    requester: "倉持 達也",
    assignee: "local-app",
    templateKey: "template_revenue_share_report",
    status: "Draft",
    contractNo: `C-REV-${Date.now()}`,
    payload: {
      issue_date: "2026年3月26日",
      vendorName: "株式会社テストパートナー",
      vendor_name: "株式会社テストパートナー",
      vendorInvoiceNum: "T1234567890123",
      vendor_invoice_num: "T1234567890123",
      minimum_guarantee: 300000,
      payment_date: "2026年4月30日",
      payment_method: "末日締め翌月末振込",
      special_note: "一部返品調整を含みます。",
      items: [
        {
          period: "2026年3月前半",
          name: "タイトルA",
          detail: "国内EC",
          calculation: "対象売上高 x 50%",
          baseAmount: 800000,
          rate: "50%",
          amount: 400000,
          deduction: 15000,
          deduction_note: "返金分を控除",
          note: "3月前半実績"
        },
        {
          period: "2026年3月後半",
          name: "タイトルB",
          detail: "海外EC",
          calculation: "対象売上高 x 45%",
          baseAmount: 600000,
          rate: "45%",
          amount: 270000,
          deduction: 0,
          deduction_note: "",
          note: "3月後半実績"
        }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const document = await documentService.generate(issue);
  const htmlPath = path.join(
    outDir,
    `${path.parse(document.pdfPath).name}-template_revenue_share_report.html`
  );
  const html = await readFile(htmlPath, "utf8");

  const checks = {
    period1: html.includes("2026年3月前半"),
    period2: html.includes("2026年3月後半"),
    deduction: html.includes("控除: ¥15,000"),
    deductionNote: html.includes("返金分を控除")
  };

  console.log(
    JSON.stringify(
      {
        pdfPath: document.pdfPath,
        htmlPath,
        checks
      },
      null,
      2
    )
  );
}

await main();
