import "dotenv/config";
import express from "express";
import path from "node:path";
import { AdminService } from "./services/adminService.js";
import { PostgresStore } from "./postgresStore.js";
import { AppStore, JsonStore } from "./store.js";
import { PrismaAdminRepository } from "./services/prismaAdminRepository.js";
import { PrismaBootstrapService } from "./services/prismaBootstrapService.js";
import { PrismaRegistryRepository } from "./services/prismaRegistryRepository.js";
import { PrismaWorkflowRepository } from "./services/prismaWorkflowRepository.js";
import { getPrismaClient } from "./services/prismaService.js";
import { BacklogService } from "./services/backlogService.js";
import { BacklogSetupService } from "./services/backlogSetupService.js";
import { CloudSignService } from "./services/cloudSignService.js";
import { DocumentService } from "./services/documentService.js";
import { GoogleDriveService } from "./services/googleDriveService.js";
import { SlackService } from "./services/slackService.js";
import { TemplateManagerService } from "./services/templateManagerService.js";
import { WorkflowService } from "./services/workflowService.js";

const rootDir = process.cwd();
const app = express();
const port = Number(process.env.PORT ?? 3005);

const dataDir = path.join(rootDir, "data");
const store: AppStore = PostgresStore.isConfigured()
  ? new PostgresStore({ jsonFallbackDir: dataDir })
  : new JsonStore(dataDir);
const prismaClient = getPrismaClient();
const prismaAdminRepository = prismaClient ? new PrismaAdminRepository(prismaClient) : undefined;
const prismaRegistryRepository = prismaClient ? new PrismaRegistryRepository(prismaClient) : undefined;
const prismaWorkflowRepository = prismaClient ? new PrismaWorkflowRepository(prismaClient) : undefined;
const prismaBootstrapService = prismaClient ? new PrismaBootstrapService(store, prismaClient) : undefined;
const documentService = new DocumentService(path.join(rootDir, "tmp"), path.join(rootDir, "templates"));
const googleDriveService = new GoogleDriveService();
const backlogService = new BacklogService();
const backlogSetupService = new BacklogSetupService();
const cloudSignService = new CloudSignService();
const slackService = new SlackService();
const adminService = new AdminService(store, slackService, prismaAdminRepository);
const templateManagerService = new TemplateManagerService(
  path.join(rootDir, "templates"),
  path.join(rootDir, "templates", "definitions")
);
const workflowService = new WorkflowService(
  store,
  documentService,
  googleDriveService,
  backlogService,
  cloudSignService,
  slackService,
  templateManagerService,
  backlogSetupService,
  prismaRegistryRepository,
  prismaAdminRepository,
  prismaWorkflowRepository
);

let pollerTimer: NodeJS.Timeout | null = null;
let pollerRunning = false;
let reminderTimer: NodeJS.Timeout | null = null;
let reminderRunning = false;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(rootDir, "public")));
app.use("/tmp", express.static(path.join(rootDir, "tmp")));

app.get("/api/dashboard", async (_req, res) => {
  res.json(await workflowService.snapshot());
});

app.get("/api/contracts", async (_req, res) => {
  const snapshot = await workflowService.snapshot();
  res.json({ contracts: snapshot.contracts ?? [] });
});

app.get("/api/deliveries", async (_req, res) => {
  const snapshot = await workflowService.snapshot();
  res.json({ deliveries: snapshot.deliveries ?? [] });
});

app.get("/api/polling-logs", async (_req, res) => {
  const snapshot = await workflowService.snapshot();
  res.json({ pollingLogs: snapshot.pollingLogs ?? [] });
});

app.get("/api/admin/dashboard", async (_req, res) => {
  res.json(await adminService.getDashboard());
});

app.get("/api/admin/contracts", async (_req, res) => {
  res.json({ contracts: await adminService.listContracts() });
});

app.get("/api/admin/deliveries", async (_req, res) => {
  res.json({ deliveries: await adminService.listDeliveries() });
});

app.get("/api/admin/polling-logs", async (_req, res) => {
  res.json({ pollingLogs: await adminService.listPollingLogs() });
});

app.get("/api/admin/users", async (_req, res) => {
  res.json({ users: await adminService.listUsers() });
});

app.get("/api/admin/users/:id", async (req, res) => {
  try {
    res.json(await adminService.getUser(Number(req.params.id)));
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.patch("/api/admin/users/:id", async (req, res) => {
  try {
    res.json(await adminService.updateUser(Number(req.params.id), req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/admin/users/sync", async (_req, res) => {
  try {
    res.json(await adminService.syncUsersFromSlack());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/api/admin/partners", async (req, res) => {
  res.json({ partners: await adminService.listPartners(String(req.query.search ?? "")) });
});

app.get("/api/admin/partners/:id", async (req, res) => {
  try {
    res.json(await adminService.getPartner(Number(req.params.id)));
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/admin/partners", async (req, res) => {
  try {
    res.status(201).json(await adminService.createPartner(req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.patch("/api/admin/partners/:id", async (req, res) => {
  try {
    res.json(await adminService.updatePartner(Number(req.params.id), req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/admin/partners/import", async (req, res) => {
  try {
    res.json(await adminService.importPartnersCsv(String(req.body.csvText ?? "")));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/api/admin/partners/export", async (_req, res) => {
  res.type("text/csv; charset=utf-8");
  res.send(await adminService.exportPartnersCsv());
});

app.get("/api/admin/license-ledger-terms", async (req, res) => {
  try {
    res.json({
      terms: await adminService.listLicenseLedgerTerms(String(req.query.contractNo ?? "").trim() || undefined)
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.put("/api/admin/license-ledger-terms/:contractNo", async (req, res) => {
  try {
    res.json({
      terms: await adminService.saveLicenseLedgerTerms(req.params.contractNo, req.body.terms ?? [])
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/api/template-definitions", async (_req, res) => {
  res.json(await workflowService.listTemplateDefinitions());
});

app.get("/api/backlog-setup/reports", async (_req, res) => {
  res.json(await workflowService.getBacklogSetupReports());
});

app.get("/api/backlog-setup/checklist", async (_req, res) => {
  res.type("text/plain; charset=utf-8").send(await workflowService.getBacklogInitialChecklist());
});

app.get("/api/backlog-setup/checklist/markdown", async (_req, res) => {
  res.type("text/markdown; charset=utf-8").send(await workflowService.getBacklogInitialChecklist());
});

app.get("/api/backlog-setup/reports/:id", async (req, res) => {
  try {
    res.json(await workflowService.getBacklogSetupReport(req.params.id));
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/api/backlog-setup/reports/:id/markdown", async (req, res) => {
  try {
    res.type("text/markdown; charset=utf-8").send(await workflowService.getBacklogSetupReportMarkdown(req.params.id));
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/template-definitions/validate", async (_req, res) => {
  try {
    res.json(await workflowService.validateTemplateDefinitions());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/template-definitions", async (req, res) => {
  try {
    res.status(201).json(await workflowService.createTemplateDefinition(req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/config", async (req, res) => {
  res.json(await workflowService.updateConfig(req.body));
});

app.post("/api/issues", async (req, res) => {
  res.status(201).json(await workflowService.createIssue(req.body));
});

app.post("/api/poller/run", async (_req, res) => {
  try {
    res.json(await workflowService.runPoller());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/backlog/test", async (_req, res) => {
  try {
    res.json(await workflowService.testBacklogConnection());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/slack/test", async (_req, res) => {
  try {
    res.json(await workflowService.testSlackConnection());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/slack/recover", async (req, res) => {
  try {
    res.json(await workflowService.recoverSlackEvents(req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/slack/test-interactive", async (req, res) => {
  try {
    res.json(await workflowService.sendInteractiveTestMessage(req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/cloudsign/test", async (_req, res) => {
  try {
    res.json(await workflowService.testCloudSignConnection());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/rds/test", async (_req, res) => {
  try {
    res.json(await workflowService.testRdsConnection());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/integrations/drive/test", async (_req, res) => {
  try {
    res.json(await workflowService.testGoogleDriveConnection());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/issues/:id/generate", async (req, res) => {
  try {
    res.json(await workflowService.generateDocument(req.params.id));
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/issues/:id/request-approval", async (req, res) => {
  try {
    res.json(await workflowService.requestIssueApproval(req.params.id));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/approvals/remind", async (_req, res) => {
  try {
    res.json(await workflowService.sendApprovalReminders());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/stamps/remind", async (_req, res) => {
  try {
    res.json(await workflowService.sendStampReminders());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/bulk-orders/import", async (req, res) => {
  try {
    res.json(await workflowService.importBulkOrderCsv(req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/issues/:id/request-stamp", async (req, res) => {
  try {
    res.json(await workflowService.requestStamp(req.params.id));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/issues/:id/cloudsign/send", async (req, res) => {
  try {
    res.json(await workflowService.sendIssueToCloudSign(req.params.id));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/cloudsign/sync", async (_req, res) => {
  try {
    res.json(await workflowService.syncCloudSignStatuses());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/issues/:id/notify", async (req, res) => {
  try {
    await workflowService.sendIssueNotification(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "legal-bridge-local-app" });
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(rootDir, "public", "admin.html"));
});

app.get("/admin/*", (_req, res) => {
  res.sendFile(path.join(rootDir, "public", "admin.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

await store.ensure();
await templateManagerService.ensure();
if (prismaBootstrapService) {
  await prismaBootstrapService.ensureSeeded();
}

const schedulePoller = async (): Promise<void> => {
  const snapshot = await workflowService.snapshot();
  const delayMs = Math.max(Number(snapshot.config.pollingIntervalSec || 30), 5) * 1000;

  if (pollerTimer) {
    clearTimeout(pollerTimer);
  }

  pollerTimer = setTimeout(async () => {
    if (!pollerRunning) {
      pollerRunning = true;
      try {
        await workflowService.runPoller();
      } catch (error) {
        console.error("Poller run failed", error);
      } finally {
        pollerRunning = false;
      }
    }
    await schedulePoller();
  }, delayMs);
};

await schedulePoller();

const scheduleReminders = async (): Promise<void> => {
  const delayMs = Math.max(Number(process.env.REMINDER_INTERVAL_SEC ?? 1800), 60) * 1000;
  if (reminderTimer) {
    clearTimeout(reminderTimer);
  }
  reminderTimer = setTimeout(async () => {
    if (!reminderRunning) {
      reminderRunning = true;
      try {
        await workflowService.sendApprovalReminders();
        await workflowService.sendStampReminders();
        await workflowService.syncCloudSignStatuses();
      } catch (error) {
        console.error("Reminder run failed", error);
      } finally {
        reminderRunning = false;
      }
    }
    await scheduleReminders();
  }, delayMs);
};

await scheduleReminders();

app.listen(port, async () => {
  console.log(`Legal Bridge Local App listening on http://localhost:${port}`);
  console.log(`Persistence: ${store.kind}`);

  try {
    const initialSnapshot = await workflowService.snapshot();
    if (
      await slackService.startSocketMode(
        initialSnapshot.config,
        ({ text, channel }) => workflowService.handleSlackCommand(text, channel),
        (payload) => workflowService.handleSlackInteraction(payload),
        (event) => workflowService.handleSlackEvent(event)
      )
    ) {
      console.log("Slack Socket Mode connected");
    } else {
      console.log("Slack Socket Mode skipped: credentials are not configured");
    }
  } catch (error) {
    console.error("Slack Socket Mode startup failed", error);
  }
});
