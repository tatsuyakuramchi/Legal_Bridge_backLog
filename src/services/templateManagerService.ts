import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ManagedTemplateDefinition,
  TemplateScanResult,
  TemplateValidationResult,
  TemplateVariableDefinition,
  VariableSource
} from "../templateManagerTypes.js";

const SKIP_WORDS = new Set([
  "if",
  "unless",
  "each",
  "with",
  "else",
  "true",
  "false",
  "null",
  "undefined",
  "and",
  "or",
  "not",
  "lookup",
  "log",
  "this",
  "root",
  "index",
  "key",
  "first",
  "last",
  "length",
  "toLocaleString",
  "toFixed",
  "toUpperCase",
  "toLowerCase",
  "getFullYear",
  "getMonth",
  "getDate",
  "toString",
  "split",
  "replace",
  "join",
  "map",
  "filter",
  "reduce",
  "forEach",
  "push",
  "pop",
  "substr",
  "substring",
  "slice",
  "trim",
  "includes",
  "startsWith",
  "endsWith",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "Number",
  "String",
  "Boolean",
  "Object",
  "Array",
  "Math",
  "Date",
  "JSON",
  "items",
  "d",
  "data",
  "vendor",
  "withholdingTax",
  "totalExTax",
  "totalTax",
  "deliveries",
  "tax_rate",
  "tax",
  "formatCurrency",
  "grandTotalExTax",
  "totalFee",
  "totalExp",
  "i",
  "r",
  "grandTotal"
]);

const LABEL_MAP: Record<string, string> = {
  CONTRACT_NO: "契約番号",
  ORDER_NO: "発注番号",
  NOTICE_ID: "通知番号",
  PROJECT_TITLE: "案件名",
  PAYMENT_DATE: "支払日",
  DELIVERY_DATE: "納品日",
  VENDOR_NAME: "取引先名",
  VENDOR_ADDRESS: "取引先住所",
  VENDOR_REP: "取引先代表者",
  VENDOR_EMAIL: "取引先メール",
  VENDOR_CONTACT_NAME: "取引先担当者",
  PARTY_A_NAME: "当社名",
  PARTY_A_ADDRESS: "当社住所",
  PARTY_A_REP: "当社代表者",
  PARTY_B_NAME: "相手方名",
  PARTY_B_ADDRESS: "相手方住所",
  PARTY_B_REP: "相手方代表者",
  BANK_NAME: "銀行名",
  BRANCH_NAME: "支店名",
  ACCOUNT_TYPE: "口座種別",
  ACCOUNT_NUMBER: "口座番号",
  ACCOUNT_HOLDER_KANA: "口座名義カナ",
  INVOICE_REGISTRATION_NUMBER: "インボイス登録番号",
  IS_INVOICE_ISSUER: "インボイス発行事業者",
  REMARKS: "備考",
  SPECIAL_TERMS: "特約事項",
  STAFF_NAME: "担当者名",
  STAFF_DEPARTMENT: "担当部署",
  STAFF_PHONE: "担当者電話番号",
  STAFF_EMAIL: "担当者メール"
};

export class TemplateManagerService {
  constructor(
    private readonly templateDir: string,
    private readonly definitionsDir: string
  ) {}

  async ensure(): Promise<void> {
    await mkdir(this.definitionsDir, { recursive: true });
  }

  async listDefinitions(): Promise<ManagedTemplateDefinition[]> {
    await this.ensure();
    const files = (await readdir(this.definitionsDir))
      .filter((file) => file.endsWith(".json"))
      .sort();
    const definitions = await Promise.all(
      files.map(async (file) =>
        JSON.parse(await readFile(path.join(this.definitionsDir, file), "utf8")) as ManagedTemplateDefinition
      )
    );
    return definitions;
  }

  async scanTemplate(templateFile: string): Promise<TemplateScanResult> {
    const raw = await readFile(path.join(this.templateDir, templateFile), "utf8");
    const topLevelSet = new Set<string>();

    for (const match of raw.matchAll(/\{\{(?:#if\s+|#unless\s+|\/)?([A-Z][A-Z0-9_]+)\}?\}/g)) {
      topLevelSet.add(match[1]);
    }
    for (const match of raw.matchAll(/(?:<%=|<\?=)\s*data\.([A-Z_][A-Z0-9_]+)/g)) {
      topLevelSet.add(match[1]);
    }
    for (const match of raw.matchAll(/\{\{(?:#if\s+|#unless\s+)?([a-z][A-Z_a-z][A-Za-z0-9_]*)\}?\}/g)) {
      if (!SKIP_WORDS.has(match[1])) {
        topLevelSet.add(match[1]);
      }
    }

    const deliverySet = new Set<string>();
    for (const match of raw.matchAll(/<\?=\s*d\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
      if (!SKIP_WORDS.has(match[1])) {
        deliverySet.add(match[1]);
      }
    }

    const itemSet = new Set<string>();
    for (const match of raw.matchAll(/item(?:s\[\])?\s*[.[\s]([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
      if (!SKIP_WORDS.has(match[1]) && match[1] !== "length" && match[1] !== "some") {
        itemSet.add(match[1]);
      }
    }

    const topLevel = [...topLevelSet].filter((value) => !SKIP_WORDS.has(value) && value.length > 1).sort();
    const deliveryVars = [...deliverySet].sort();
    const itemVars = [...itemSet].sort();

    return {
      templateFile,
      topLevel,
      deliveryVars,
      itemVars,
      rawCount: topLevel.length + deliveryVars.length + itemVars.length
    };
  }

  async validateAll(): Promise<TemplateValidationResult[]> {
    const definitions = await this.listDefinitions();
    const results = await Promise.all(definitions.map((definition) => this.validateDefinition(definition)));
    return results;
  }

  async createDefinition(input: {
    id: string;
    templateFile: string;
    documentName: string;
    issueTypes: string[];
    contractNoPrefix: "C" | "PO" | "LIC";
    mergeWith?: string[];
    notes?: string;
  }): Promise<ManagedTemplateDefinition> {
    const scan = await this.scanTemplate(input.templateFile);
    const topLevelVars = scan.topLevel.map((name) => this.makeVariable(name));
    const deliveryVars = scan.deliveryVars.map((name) => this.makeVariable(name.toUpperCase(), "d"));
    const itemVars = scan.itemVars.map((name) => this.makeItemVariable(name));

    const definition: ManagedTemplateDefinition = {
      id: input.id,
      templateFile: input.templateFile,
      documentName: input.documentName,
      issueTypes: input.issueTypes,
      contractNoPrefix: input.contractNoPrefix,
      mergeWith: input.mergeWith,
      topLevelVars,
      deliveryVars: deliveryVars.length ? deliveryVars : undefined,
      itemVars: itemVars.length ? itemVars : undefined,
      variables: [...topLevelVars, ...deliveryVars, ...itemVars],
      notes: input.notes
    };

    await this.ensure();
    await writeFile(
      path.join(this.definitionsDir, `${definition.id}.json`),
      JSON.stringify(definition, null, 2),
      "utf8"
    );
    return definition;
  }

  private async validateDefinition(definition: ManagedTemplateDefinition): Promise<TemplateValidationResult> {
    const templatePath = path.join(this.templateDir, definition.templateFile);
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await readFile(templatePath, "utf8");
    } catch {
      return {
        id: definition.id,
        templateFile: definition.templateFile,
        passed: false,
        errors: [`テンプレートファイルが見つかりません: ${definition.templateFile}`],
        warnings: []
      };
    }

    const scan = await this.scanTemplate(definition.templateFile);
    const htmlVars = new Set([
      ...scan.topLevel,
      ...scan.deliveryVars.map((value) => `d.${value}`),
      ...scan.itemVars.map((value) => `items.${value}`)
    ]);
    const definedVars = new Set(definition.variables.map((value) => value.arrayPrefix ? `${value.arrayPrefix}.${value.name}` : value.name));

    for (const value of htmlVars) {
      const baseName = value.replace(/^(d\.|items\.)/, "");
      if (!definedVars.has(value) && !definedVars.has(baseName)) {
        warnings.push(`HTML で使用される変数 ${value} が定義にありません。`);
      }
    }

    for (const variable of definition.variables) {
      if (variable.required && !variable.source) {
        errors.push(`必須変数 ${variable.name} に source がありません。`);
      }
    }

    if (!definition.templateFile) {
      errors.push("templateFile が設定されていません。");
    }
    if (!definition.issueTypes || definition.issueTypes.length === 0) {
      errors.push("issueTypes が設定されていません。");
    }

    return {
      id: definition.id,
      templateFile: definition.templateFile,
      passed: errors.length === 0,
      errors,
      warnings
    };
  }

  private makeVariable(name: string, arrayPrefix?: string): TemplateVariableDefinition {
    return {
      name,
      label: LABEL_MAP[name] ?? name,
      required: !new Set(["SPECIAL_TERMS", "REMARKS", "STAFF_PHONE"]).has(name),
      source: this.inferSource(name),
      arrayPrefix
    };
  }

  private makeItemVariable(name: string): TemplateVariableDefinition {
    return {
      name,
      label: name,
      required: false,
      source: "manual",
      isArray: true,
      arrayPrefix: "items"
    };
  }

  private inferSource(name: string): VariableSource {
    const value = name.toUpperCase();
    if (value === "CONTRACT_NO" || value === "ORDER_NO" || value === "NOTICE_ID" || value === "DELIVERY_ID") {
      return "auto";
    }
    if (value.startsWith("PARTY_A_")) {
      return "fixed:company";
    }
    if (value === "PARTY_B_NAME" || value === "VENDOR_NAME") {
      return "partner.name";
    }
    if (value === "PARTY_B_ADDRESS" || value === "VENDOR_ADDRESS") {
      return "partner.address";
    }
    if (value === "PARTY_B_REP" || value === "VENDOR_REP" || value === "PARTY_B_REPRESENTATIVE") {
      return "partner.representative";
    }
    if (value === "VENDOR_EMAIL") {
      return "partner.contact_email";
    }
    if (value === "VENDOR_CONTACT_NAME") {
      return "partner.contact_person";
    }
    if (value === "IS_INVOICE_ISSUER") {
      return "partner.is_invoice_issuer";
    }
    if (
      value === "INVOICE_REGISTRATION_NUMBER" ||
      value === "VENDOR_INVOICE_NUM" ||
      value === "CONTRACTOR_INVOICE_NUM"
    ) {
      return "partner.invoice_registration_number";
    }
    if (value === "BANK_NAME") {
      return "partner.bank_name";
    }
    if (value === "BANK_BRANCH" || value === "BRANCH_NAME") {
      return "partner.bank_branch";
    }
    if (value === "ACCOUNT_TYPE" || value === "BANK_ACCOUNT_TYPE") {
      return "partner.bank_account_type";
    }
    if (value === "ACCOUNT_NUMBER" || value === "BANK_ACCOUNT_NO") {
      return "partner.bank_account_number";
    }
    if (value === "ACCOUNT_HOLDER_KANA" || value === "BANK_ACCOUNT_NAME") {
      return "partner.bank_account_holder";
    }
    if (value === "STAFF_NAME" || value === "STAFF_DEPARTMENT" || value === "STAFF_EMAIL" || value === "STAFF_PHONE") {
      return "user.name";
    }
    if (value.startsWith("TOTAL_") || value.startsWith("GRAND_")) {
      return "calc";
    }
    return `backlog.${name.toLowerCase()}`;
  }
}
