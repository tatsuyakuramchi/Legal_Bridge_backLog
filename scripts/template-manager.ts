import fs from "node:fs";
import path from "node:path";
import { BacklogSetupService } from "../src/services/backlogSetupService.js";
import { TemplateManagerService } from "../src/services/templateManagerService.js";

const rootDir = process.cwd();
const templatesDir = path.join(rootDir, "templates");
const definitionsDir = path.join(rootDir, "templates", "definitions");

const service = new TemplateManagerService(templatesDir, definitionsDir);
const backlogSetupService = new BacklogSetupService();

function printUsage(): void {
  console.log("Usage:");
  console.log("  npm run templates:list");
  console.log("  npm run templates:validate");
  console.log("  npm run templates:add -- <id> <templateFile> <documentName> <issueTypesCsv> [C|PO|LIC]");
  console.log("  npm run templates:backlog-init");
  console.log("  npm run templates:backlog-init -- --markdown");
  console.log("  npm run templates:backlog-setup -- <templateId>");
  console.log("  npm run templates:backlog-setup -- <templateId> --markdown");
}

function writeMarkdownIfRequested(fileName: string, content: string, markdown: boolean): void {
  if (!markdown) {
    return;
  }
  const outputPath = path.join(rootDir, fileName);
  fs.writeFileSync(outputPath, content, "utf8");
  console.log(`Saved: ${outputPath}`);
}

async function cmdList(): Promise<void> {
  const definitions = await service.listDefinitions();
  for (const definition of definitions) {
    console.log(
      `${definition.id}\t${definition.documentName}\t${definition.templateFile}\t${definition.variables.length}`
    );
  }
}

async function cmdValidate(): Promise<void> {
  const results = await service.validateAll();
  let hasError = false;

  for (const result of results) {
    console.log(`${result.passed ? "OK" : "NG"} ${result.id} (${result.templateFile})`);
    for (const error of result.errors) {
      console.log(`  ERROR: ${error}`);
      hasError = true;
    }
    for (const warning of result.warnings) {
      console.log(`  WARN: ${warning}`);
    }
  }

  process.exitCode = hasError ? 1 : 0;
}

async function cmdAdd(args: string[]): Promise<void> {
  const id = args[0];
  const templateFile = args[1];
  const documentName = args[2];
  const issueTypes = (args[3] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const contractNoPrefix = (args[4] ?? "C") as "C" | "PO" | "LIC";

  if (!id || !templateFile || !documentName || issueTypes.length === 0) {
    throw new Error("Usage: npm run templates:add -- <id> <templateFile> <documentName> <issueTypesCsv> [C|PO|LIC]");
  }

  const definition = await service.createDefinition({
    id,
    templateFile,
    documentName,
    issueTypes,
    contractNoPrefix
  });

  console.log(`Created: ${definition.id}`);
}

async function cmdBacklogInit(markdown: boolean): Promise<void> {
  const definitions = await service.listDefinitions();
  const content = backlogSetupService.createInitialChecklist(definitions);
  console.log(content);
  writeMarkdownIfRequested("backlog-initial-setup.md", content, markdown);
}

async function cmdBacklogSetup(templateId: string | undefined, markdown: boolean): Promise<void> {
  if (!templateId) {
    throw new Error("Usage: npm run templates:backlog-setup -- <templateId> [--markdown]");
  }

  const definitions = await service.listDefinitions();
  const definition = definitions.find((item) => item.id === templateId);
  if (!definition) {
    throw new Error(`Template definition not found: ${templateId}`);
  }

  const content = backlogSetupService.renderReport(backlogSetupService.createReport(definition));
  console.log(content);
  writeMarkdownIfRequested(`backlog-setup-${templateId}.md`, content, markdown);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const markdown = args.includes("--markdown");
  const cleanArgs = args.filter((arg) => arg !== "--markdown");

  switch (command) {
    case "list":
      await cmdList();
      return;
    case "validate":
      await cmdValidate();
      return;
    case "add":
      await cmdAdd(cleanArgs);
      return;
    case "backlog-init":
      await cmdBacklogInit(markdown);
      return;
    case "backlog-setup":
      await cmdBacklogSetup(cleanArgs[0], markdown);
      return;
    default:
      printUsage();
  }
}

await main();
