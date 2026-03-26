import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { PrismaAdminRepository } from "../src/services/prismaAdminRepository.js";
import { PrismaRegistryRepository } from "../src/services/prismaRegistryRepository.js";
import { PrismaWorkflowRepository } from "../src/services/prismaWorkflowRepository.js";
import { getPrismaClient } from "../src/services/prismaService.js";
import { BacklogService } from "../src/services/backlogService.js";
import { BacklogSetupService } from "../src/services/backlogSetupService.js";
import { CloudSignService } from "../src/services/cloudSignService.js";
import { DocumentService } from "../src/services/documentService.js";
import { GoogleDriveService } from "../src/services/googleDriveService.js";
import { SlackService } from "../src/services/slackService.js";
import { TemplateManagerService } from "../src/services/templateManagerService.js";
import { WorkflowService } from "../src/services/workflowService.js";

async function main(): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("Prisma is not configured.");
  }

  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, "tmp", "ledger-test-data");
  const outDir = path.join(rootDir, "tmp", "ledger-test-output");
  await mkdir(dataDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const store = new JsonStore(dataDir);
  await store.ensure();

  const prismaAdminRepository = new PrismaAdminRepository(prisma);
  const prismaRegistryRepository = new PrismaRegistryRepository(prisma);
  const prismaWorkflowRepository = new PrismaWorkflowRepository(prisma);
  const documentService = new DocumentService(outDir, path.join(rootDir, "templates"));
  const templateManagerService = new TemplateManagerService(
    path.join(rootDir, "templates"),
    path.join(rootDir, "templates", "definitions")
  );
  await templateManagerService.ensure();

  const workflowService = new WorkflowService(
    store,
    documentService,
    new GoogleDriveService(),
    new BacklogService(),
    new CloudSignService(),
    new SlackService(),
    templateManagerService,
    new BacklogSetupService(),
    prismaRegistryRepository,
    prismaAdminRepository,
    prismaWorkflowRepository
  );

  const contractNo = `LIC-TEST-${Date.now()}`;
  const suffix = String(Date.now()).slice(-6);
  const issueKey = `LG-${suffix}`;
  const partner = await prisma.partners.findFirst({ orderBy: { id: "asc" } });
  await prisma.contracts.create({
    data: {
      backlog_issue_id: Math.floor(Date.now() / 1000),
      backlog_issue_key: issueKey,
      contract_no: contractNo,
      partner_id: partner?.id ?? null,
      counterparty: partner?.name ?? "テスト取引先",
      contract_type: "template_ledger_v5__1_",
      status: "草案",
      created_at: new Date(),
      updated_at: new Date()
    }
  });

  await prismaAdminRepository.saveLicenseLedgerTerms(contractNo, [
    {
      contract_no: contractNo,
      term_order: 1,
      region_language_label: "日本語 / 日本国内",
      base_price_label: "定価",
      calc_method: "売上歩率",
      rate: "8.5",
      calc_period: "毎月",
      mg_ag: "300000",
      payment_terms: "月末締め翌月末払い",
      formula: "売上高 × 8.5%",
      note: "返品控除後",
      currency: "JPY"
    },
    {
      contract_no: contractNo,
      term_order: 2,
      heading: "再許諾分配",
      region: "全世界",
      language: "英語",
      calc_method: "分配",
      share_rate: "50",
      payment_terms: "四半期末締め翌月末払い",
      formula: "受領額 × 50%",
      formula_note: "税抜受領額基準",
      summary: "サブライセンス収益分配",
      note: "送金手数料控除前",
      currency: "USD"
    }
  ]);

  const issue = await workflowService.createIssue({
    issueKey,
    title: "ライセンス台帳 DB 補完テスト",
    requester: "倉持 達也",
    assignee: "local-app",
    templateKey: "template_ledger_v5__1_",
    contractNo,
    payload: {
      vendorName: partner?.name ?? "テスト取引先",
      partnerName: partner?.name ?? "テスト取引先",
      partnerAddress: partner?.address ?? "東京都千代田区テスト1-2-3",
      partnerRepresentative: partner?.representative ?? "代表取締役 テスト",
      is_corporation: partner?.is_corporation ?? true,
      master_contract_ref: "テスト基本契約",
      baseContractName: "テスト基本契約",
      licenseTypeName: "独占的",
      licenseStartDate: "2026-04-01",
      licensePeriodNote: "2年間",
      originalWork: "テスト原作",
      originalWorkNote: "副題あり",
      productName: "テスト商品",
      materialName: "キービジュアル",
      materialNo: "MAT-001",
      materialRightsHolder: "原作者A",
      supervisor: "監修者B",
      specialNote: "DB 金銭条件で出力確認",
      requester_slack_id: "U08217X0A07"
    }
  });

  const document = await workflowService.generateDocument(issue.id);
  console.log(
    JSON.stringify(
      {
        contractNo,
        issueId: issue.id,
        issueKey: issue.issueKey,
        pdfPath: document.pdfPath,
        htmlPath: document.htmlPath
      },
      null,
      2
    )
  );
}

await main();
