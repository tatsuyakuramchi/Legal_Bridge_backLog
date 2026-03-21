import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppConfig } from "../types.js";

type CloudSignTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export type CloudSignDocument = {
  id?: string | number;
  title?: string;
  status?: number;
  files?: Array<{ id?: string | number; name?: string }>;
  participants?: Array<{ id?: string | number; email?: string; name?: string }>;
  [key: string]: unknown;
};

export class CloudSignService {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  isConfigured(_config: AppConfig): boolean {
    return Boolean((process.env.CLOUDSIGN_CLIENT_ID || "").trim());
  }

  async testConnection(config: AppConfig): Promise<{ ok: true; baseUrl: string }> {
    await this.getAccessToken(config);
    return { ok: true, baseUrl: this.baseUrl() };
  }

  async createDocument(
    config: AppConfig,
    input: {
      title: string;
      note?: string;
      templateId?: string;
    }
  ): Promise<CloudSignDocument> {
    const body = new URLSearchParams();
    body.set("title", input.title);
    if (input.note) {
      body.set("note", input.note);
    }
    if (input.templateId) {
      body.set("template_id", input.templateId);
    }
    return this.requestJson(config, "/documents", {
      method: "POST",
      body
    });
  }

  async addFile(config: AppConfig, documentId: string, pdfPath: string): Promise<Record<string, unknown>> {
    const form = new FormData();
    const fileBuffer = await readFile(pdfPath);
    const fileName = path.basename(pdfPath);
    form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), fileName);
    return this.requestJson(config, `/documents/${encodeURIComponent(documentId)}/files`, {
      method: "POST",
      body: form
    });
  }

  async addParticipant(
    config: AppConfig,
    documentId: string,
    participant: {
      email: string;
      name: string;
      company?: string;
    }
  ): Promise<Record<string, unknown>> {
    const body = new URLSearchParams();
    body.set("email", participant.email);
    body.set("name", participant.name);
    if (participant.company) {
      body.set("company", participant.company);
    }
    return this.requestJson(config, `/documents/${encodeURIComponent(documentId)}/participants`, {
      method: "POST",
      body
    });
  }

  async sendDocument(config: AppConfig, documentId: string): Promise<Record<string, unknown>> {
    return this.requestJson(config, `/documents/${encodeURIComponent(documentId)}`, {
      method: "POST",
      body: new URLSearchParams()
    });
  }

  async getDocument(config: AppConfig, documentId: string): Promise<CloudSignDocument> {
    return this.requestJson(config, `/documents/${encodeURIComponent(documentId)}`);
  }

  async downloadSignedFile(
    config: AppConfig,
    documentId: string,
    fileId: string
  ): Promise<Uint8Array> {
    return this.requestBinary(config, `/documents/${encodeURIComponent(documentId)}/files/${encodeURIComponent(fileId)}`);
  }

  async downloadCertificate(config: AppConfig, documentId: string): Promise<Uint8Array> {
    return this.requestBinary(config, `/documents/${encodeURIComponent(documentId)}/certificate`);
  }

  private async getAccessToken(config: AppConfig): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }

    const clientId = (process.env.CLOUDSIGN_CLIENT_ID || "").trim();
    if (!clientId) {
      throw new Error("CloudSign client id is not configured.");
    }

    const body = new URLSearchParams();
    body.set("client_id", clientId);
    const response = await fetch(`${this.baseUrl()}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
      },
      body: body.toString()
    });
    const payload = (await response.json()) as Partial<CloudSignTokenResponse> & { error?: string };
    if (!response.ok || !payload.access_token) {
      throw new Error(`CloudSign token error: ${payload.error ?? response.statusText}`);
    }

    const expiresIn = Number(payload.expires_in ?? 3600);
    this.cachedToken = {
      value: payload.access_token,
      expiresAt: now + expiresIn * 1000
    };
    return payload.access_token;
  }

  private async requestJson(
    config: AppConfig,
    pathname: string,
    init?: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: URLSearchParams | FormData;
    }
  ): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken(config);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`
    };
    let body: BodyInit | undefined;
    if (init?.body instanceof URLSearchParams) {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
      body = init.body.toString();
    } else if (init?.body instanceof FormData) {
      body = init.body;
    }

    const response = await fetch(`${this.baseUrl()}${pathname}`, {
      method: init?.method ?? "GET",
      headers,
      body
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`CloudSign API error: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
  }

  private async requestBinary(config: AppConfig, pathname: string): Promise<Uint8Array> {
    const token = await this.getAccessToken(config);
    const response = await fetch(`${this.baseUrl()}${pathname}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`CloudSign API error: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private baseUrl(): string {
    const sandbox = /^(1|true|yes|on)$/i.test((process.env.CLOUDSIGN_USE_SANDBOX || "").trim());
    return sandbox ? "https://api-sandbox.cloudsign.jp" : "https://api.cloudsign.jp";
  }
}
