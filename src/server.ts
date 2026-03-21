import "dotenv/config";
import express from "express";
import path from "node:path";
import { JsonStore } from "./store.js";
import { BacklogService } from "./services/backlogService.js";
import { BacklogSetupService } from "./services/backlogSetupService.js";
import { DocumentService } from "./services/documentService.js";
import { SlackService } from "./services/slackService.js";
import { TemplateManagerService } from "./services/templateManagerService.js";
import { WorkflowService } from "./services/workflowService.js";

const rootDir = process.cwd();
const app = express();
const port = Number(process.env.PORT ?? 3005);

const store = new JsonStore(path.join(rootDir, "data"));
const documentService = new DocumentService(path.join(rootDir, "tmp"), path.join(rootDir, "templates"));
const backlogService = new BacklogService();
const backlogSetupService = new BacklogSetupService();
const slackService = new SlackService();
const templateManagerService = new TemplateManagerService(
  path.join(rootDir, "templates"),
  path.join(rootDir, "templates", "definitions")
);
const workflowService = new WorkflowService(
  store,
  documentService,
  backlogService,
  slackService,
  templateManagerService,
  backlogSetupService
);

let pollerTimer: NodeJS.Timeout | null = null;
let pollerRunning = false;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(rootDir, "public")));
app.use("/tmp", express.static(path.join(rootDir, "tmp")));

app.get("/api/dashboard", async (_req, res) => {
  res.json(await workflowService.snapshot());
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

app.post("/api/issues/:id/generate", async (req, res) => {
  try {
    res.json(await workflowService.generateDocument(req.params.id));
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Unknown error" });
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

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

await store.ensure();
await templateManagerService.ensure();

const initialSnapshot = await workflowService.snapshot();
if (
  await slackService.startSocketMode(initialSnapshot.config, ({ text, channel }) =>
    workflowService.handleSlackCommand(text, channel)
  )
) {
  console.log("Slack Socket Mode connected");
} else {
  console.log("Slack Socket Mode skipped: credentials are not configured");
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

app.listen(port, () => {
  console.log(`Legal Bridge Local App listening on http://localhost:${port}`);
});
