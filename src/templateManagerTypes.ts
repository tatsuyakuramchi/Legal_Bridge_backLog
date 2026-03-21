export type VariableSource =
  | "auto"
  | `partner.${string}`
  | `backlog.${string}`
  | `fixed:${string}`
  | `user.${string}`
  | "calc"
  | "manual";

export interface TemplateVariableDefinition {
  name: string;
  label: string;
  required: boolean;
  source: VariableSource;
  defaultValue?: string;
  isArray?: boolean;
  arrayPrefix?: string;
}

export interface ManagedTemplateDefinition {
  id: string;
  templateFile: string;
  documentName: string;
  issueTypes: string[];
  contractNoPrefix: "C" | "PO" | "LIC";
  mergeWith?: string[];
  variables: TemplateVariableDefinition[];
  topLevelVars: TemplateVariableDefinition[];
  deliveryVars?: TemplateVariableDefinition[];
  itemVars?: TemplateVariableDefinition[];
  notes?: string;
}

export interface TemplateScanResult {
  templateFile: string;
  topLevel: string[];
  deliveryVars: string[];
  itemVars: string[];
  rawCount: number;
}

export interface TemplateValidationResult {
  id: string;
  templateFile: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}
