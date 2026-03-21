import { ManagedTemplateDefinition, TemplateVariableDefinition } from "../templateManagerTypes.js";

export interface BacklogFieldSuggestion {
  name: string;
  type: string;
  required: boolean;
  note: string;
  options?: string[];
}

export interface BacklogSetupReport {
  templateId: string;
  documentName: string;
  issueTypes: string[];
  newAttributes: BacklogFieldSuggestion[];
  commonAttributesNote: string;
  statusesNote: string;
}

export type CommonStatus = {
  id: number;
  name: string;
  note: string;
};

export type CommonAttribute = {
  name: string;
  type: string;
  required: boolean;
  note: string;
  options?: string[];
};

export const COMMON_STATUSES: CommonStatus[] = [
  { id: 1, name: "未対応", note: "新規作成直後の状態" },
  { id: 2, name: "レビュー中", note: "" },
  { id: 3, name: "文書作成開始", note: "システム起動対象" },
  { id: 4, name: "確認待ち", note: "システム更新対象" },
  { id: 5, name: "相手方OK（CloudSign）", note: "システム更新対象" },
  { id: 6, name: "相手方OK（紙）", note: "システム更新対象" },
  { id: 7, name: "相手方送付済み", note: "システム更新対象" },
  { id: 8, name: "納品依頼中", note: "" },
  { id: 9, name: "納品依頼完了", note: "" },
  { id: 10, name: "検収開始中", note: "システム更新対象" },
  { id: 11, name: "入金済", note: "システム更新対象" },
  { id: 12, name: "アーカイブ", note: "" },
  { id: 13, name: "差戻", note: "" },
  { id: 14, name: "対応中", note: "手動更新用" },
  { id: 15, name: "確認中", note: "手動更新用" },
  { id: 16, name: "通知済", note: "通知書系で利用" },
  { id: 17, name: "通知前", note: "通知書系で利用" },
  { id: 18, name: "レビュー中", note: "相手方確認レビュー用" },
  { id: 19, name: "レビュー完了", note: "相手方確認レビュー用" },
  { id: 20, name: "ドラフト作成中", note: "カスタムドラフト用" },
  { id: 21, name: "確認待ち（カスタムドラフト）", note: "カスタムドラフト用" },
  { id: 22, name: "レビュー後再調整", note: "カスタムドラフト用" }
];

export const COMMON_ATTRIBUTES: CommonAttribute[] = [
  { name: "相手方コード", type: "テキスト", required: false, note: "既存マスターと連携する場合に利用" },
  { name: "相手方名", type: "テキスト", required: true, note: "" },
  { name: "相手方担当者", type: "テキスト", required: false, note: "" },
  { name: "相手方メールアドレス", type: "テキスト", required: false, note: "CloudSign 利用時に使用" },
  { name: "契約締結日", type: "日付", required: false, note: "" },
  { name: "契約開始日", type: "日付", required: false, note: "自動更新がある場合に利用" },
  { name: "自動更新", type: "リスト", required: false, note: "あり / なし", options: ["あり", "なし"] },
  { name: "支払条件", type: "リスト", required: false, note: "", options: ["月末締め翌月末払い", "検収後30日", "その他"] },
  { name: "検収方法", type: "リスト", required: false, note: "システム制御用", options: ["検収開始", "納品確認"] },
  { name: "PDF Drive URL", type: "テキスト", required: false, note: "生成PDFの保存先" },
  { name: "確認ステータス", type: "リスト", required: false, note: "システム制御用", options: ["未確認", "確認中"] },
  { name: "通知書 Drive URL", type: "テキスト", required: false, note: "通知書生成時に使用" },
  { name: "通知書 発行日", type: "日付", required: false, note: "通知書生成時に使用" },
  { name: "Driveフォルダーパス", type: "テキスト", required: false, note: "システム制御用" }
];

export class BacklogSetupService {
  createReport(definition: ManagedTemplateDefinition): BacklogSetupReport {
    const backlogVars = (definition.topLevelVars || []).filter(
      (variable) =>
        String(variable.source).startsWith("backlog.") && !variable.isArray && variable.arrayPrefix !== "d"
    );

    return {
      templateId: definition.id,
      documentName: definition.documentName,
      issueTypes: definition.issueTypes,
      newAttributes: backlogVars.map((variable) => this.toFieldSuggestion(variable)),
      commonAttributesNote: "共通カスタム属性はテンプレート横断で使う前提です。",
      statusesNote: "ステータスはテンプレート横断で共通運用します。"
    };
  }

  createInitialChecklist(definitions: ManagedTemplateDefinition[]): string {
    const issueTypes = [...new Set(definitions.flatMap((definition) => definition.issueTypes))].sort();
    const fields = new Map<string, BacklogFieldSuggestion>();

    for (const definition of definitions) {
      for (const attribute of this.createReport(definition).newAttributes) {
        if (!fields.has(attribute.name)) {
          fields.set(attribute.name, attribute);
        }
      }
    }

    const lines: string[] = [];
    lines.push("# Backlog 初期設定チェックリスト");
    lines.push("");
    lines.push("## 1. 課題タイプ");
    issueTypes.forEach((type) => lines.push(`- ${type}`));
    lines.push("");
    lines.push("## 2. 共通ステータス");
    COMMON_STATUSES.forEach((status) => lines.push(`- ${status.name}${status.note ? `: ${status.note}` : ""}`));
    lines.push("");
    lines.push("## 3. 共通カスタム属性");
    COMMON_ATTRIBUTES.forEach((attribute) =>
      lines.push(`- ${attribute.name} / ${attribute.type}${attribute.required ? " / 必須" : ""}`)
    );
    lines.push("");
    lines.push("## 4. テンプレート固有属性");
    if (fields.size === 0) {
      lines.push("- 追加なし");
    } else {
      for (const field of fields.values()) {
        lines.push(`- ${field.name} / ${field.type}${field.required ? " / 必須" : ""} / ${field.note}`);
      }
    }

    return lines.join("\n");
  }

  renderReport(report: BacklogSetupReport): string {
    const lines: string[] = [];
    lines.push(`# Backlog 設定チェックリスト: ${report.templateId}`);
    lines.push("");
    lines.push(`- 文書名: ${report.documentName}`);
    lines.push(`- 対応課題タイプ: ${report.issueTypes.join(", ") || "未設定"}`);
    lines.push(`- 共通属性メモ: ${report.commonAttributesNote}`);
    lines.push(`- ステータスメモ: ${report.statusesNote}`);
    lines.push("");
    lines.push("## 追加が必要な属性");

    if (report.newAttributes.length === 0) {
      lines.push("- 追加なし");
      return lines.join("\n");
    }

    for (const attribute of report.newAttributes) {
      const options = attribute.options?.length ? ` / 候補: ${attribute.options.join(", ")}` : "";
      lines.push(
        `- ${attribute.name} / ${attribute.type}${attribute.required ? " / 必須" : ""} / 変数: ${attribute.note}${options}`
      );
    }

    return lines.join("\n");
  }

  private toFieldSuggestion(variable: TemplateVariableDefinition): BacklogFieldSuggestion {
    return {
      name: variable.label || variable.name,
      type: this.inferFieldType(variable),
      required: variable.required,
      note: variable.name,
      options: this.inferOptions(variable)
    };
  }

  private inferFieldType(variable: TemplateVariableDefinition): string {
    const name = variable.name.toUpperCase();
    if (name.includes("DATE") || name.includes("_AT")) {
      return "日付";
    }
    if (
      name.includes("AMOUNT") ||
      name.includes("PRICE") ||
      name.includes("DAYS") ||
      name.includes("YEARS") ||
      name.includes("COUNT") ||
      name.includes("RATE") ||
      name.includes("QUANTITY")
    ) {
      return "数値";
    }
    if (name === "IS_INVOICE_ISSUER" || name.includes("IS_CORPORATION") || name.includes("HAS_")) {
      return "リスト";
    }
    if (name.includes("TERMS") || name.includes("SCOPE") || name.includes("PURPOSE") || name.includes("REMARKS")) {
      return "テキスト（複数行）";
    }
    if (variable.source === "auto" || String(variable.source).startsWith("fixed:")) {
      return "自動入力";
    }
    if (String(variable.source).startsWith("partner.")) {
      return "相手方マスター";
    }
    if (String(variable.source).startsWith("user.")) {
      return "ユーザー情報";
    }
    return "テキスト";
  }

  private inferOptions(variable: TemplateVariableDefinition): string[] | undefined {
    const name = variable.name.toUpperCase();
    if (name === "IS_INVOICE_ISSUER" || name.includes("IS_CORPORATION") || name.includes("HAS_")) {
      return ["true", "false"];
    }
    if (name === "PAYMENT_METHOD") {
      return ["PREPAY", "COD", "MONTHLY"];
    }
    return undefined;
  }
}
