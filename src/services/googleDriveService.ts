import { createHmac, createHash, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { AppConfig, DocumentRecord } from "../types.js";

type ServiceAccountCredentials = {
  type: "service_account";
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type ExternalAccountCredentials = {
  type: "external_account";
  audience: string;
  subject_token_type: string;
  token_url: string;
  service_account_impersonation_url?: string;
  credential_source: {
    environment_id: string;
    region_url: string;
    url: string;
    regional_cred_verification_url: string;
  };
};

type GoogleCredentials = ServiceAccountCredentials | ExternalAccountCredentials;

type AwsSecurityCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  token?: string;
};

type DriveFile = {
  id: string;
  webViewLink?: string;
  webContentLink?: string;
};

type DriveUploadResult = {
  fileUrl: string;
  folderUrl: string;
};

type CachedAccessToken = {
  accessToken: string;
  expiresAt: number;
};

export class GoogleDriveService {
  private credentialsPromise: Promise<GoogleCredentials | null> | null = null;
  private cachedToken: CachedAccessToken | null = null;

  isConfigured(config: AppConfig): boolean {
    return Boolean(config.driveRootFolderId && process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  async testConnection(config: AppConfig): Promise<{ ok: true; rootFolderId: string }> {
    if (!this.isConfigured(config)) {
      throw new Error("Google Drive is not configured. Set DRIVE_ROOT_FOLDER_ID and GOOGLE_APPLICATION_CREDENTIALS.");
    }

    const folder = await this.request<{ id: string }>(
      "GET",
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.driveRootFolderId)}?fields=id`
    );
    return { ok: true, rootFolderId: folder.id };
  }

  async uploadDocument(config: AppConfig, document: DocumentRecord): Promise<DriveUploadResult> {
    if (!this.isConfigured(config)) {
      throw new Error("Google Drive is not configured.");
    }

    const folderId = await this.ensureFolder(config.driveRootFolderId, document.driveFolderName);
    const uploadedFile = await this.createFile(folderId, document.fileName, document.pdfPath);
    return {
      fileUrl: uploadedFile.webViewLink ?? uploadedFile.webContentLink ?? `https://drive.google.com/file/d/${uploadedFile.id}/view`,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`
    };
  }

  private async ensureFolder(parentFolderId: string, folderName: string): Promise<string> {
    const escapedName = folderName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = [
      `name = '${escapedName}'`,
      `'${parentFolderId}' in parents`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`
    ].join(" and ");
    const encodedQuery = encodeURIComponent(query);
    const existing = await this.request<{ files?: Array<{ id: string }> }>(
      "GET",
      `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`
    );
    const found = existing.files?.[0]?.id;
    if (found) {
      return found;
    }

    const created = await this.request<{ id: string }>(
      "POST",
      "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
      {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId]
      }
    );
    return created.id;
  }

  private async createFile(folderId: string, fileName: string, localPdfPath: string): Promise<DriveFile> {
    const fileBuffer = await readFile(localPdfPath);
    const boundary = `codex-${Date.now()}`;
    const metadata = {
      name: basename(fileName),
      parents: [folderId]
    };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    return this.request<DriveFile>(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink&supportsAllDrives=true",
      body,
      {
        "Content-Type": `multipart/related; boundary=${boundary}`
      }
    );
  }

  private async request<T>(
    method: "GET" | "POST",
    url: string,
    body?: Buffer | Record<string, unknown>,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body && !Buffer.isBuffer(body) ? { "Content-Type": "application/json" } : {}),
        ...headers
      },
      body: body ? (Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body)) : undefined
    });

    if (!response.ok) {
      throw new Error(`Google Drive API error (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.accessToken;
    }

    const credentials = await this.loadCredentials();
    const token =
      credentials.type === "service_account"
        ? await this.exchangeServiceAccountAccessToken(credentials)
        : await this.exchangeExternalAccountAccessToken(credentials);
    this.cachedToken = token;
    return token.accessToken;
  }

  private async exchangeServiceAccountAccessToken(credentials: ServiceAccountCredentials): Promise<CachedAccessToken> {
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = credentials.token_uri ?? "https://oauth2.googleapis.com/token";
    const header = this.toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = this.toBase64Url(
      JSON.stringify({
        iss: credentials.client_email,
        scope: "https://www.googleapis.com/auth/drive",
        aud: tokenUri,
        exp: now + 3600,
        iat: now
      })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const signature = signer.sign(credentials.private_key, "base64url");
    const assertion = `${header}.${payload}.${signature}`;

    const response = await fetch(tokenUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });
    if (!response.ok) {
      throw new Error(`Google OAuth token error (${response.status}): ${await response.text()}`);
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new Error("Google OAuth token response did not contain access_token.");
    }
    return {
      accessToken: json.access_token,
      expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000
    };
  }

  private async exchangeExternalAccountAccessToken(credentials: ExternalAccountCredentials): Promise<CachedAccessToken> {
    const subjectToken = await this.createAwsSubjectToken(credentials);
    const stsResponse = await fetch(credentials.token_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        audience: credentials.audience,
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        scope: "https://www.googleapis.com/auth/drive",
        subject_token_type: credentials.subject_token_type,
        subject_token: subjectToken
      })
    });
    if (!stsResponse.ok) {
      throw new Error(`Google STS token exchange error (${stsResponse.status}): ${await stsResponse.text()}`);
    }
    const stsJson = (await stsResponse.json()) as { access_token?: string; expires_in?: number };
    if (!stsJson.access_token) {
      throw new Error("Google STS token response did not contain access_token.");
    }

    if (!credentials.service_account_impersonation_url && !process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim()) {
      return {
        accessToken: stsJson.access_token,
        expiresAt: Date.now() + Number(stsJson.expires_in ?? 3600) * 1000
      };
    }

    return this.exchangeImpersonatedServiceAccountAccessToken(credentials, stsJson.access_token);
  }

  private async exchangeImpersonatedServiceAccountAccessToken(
    credentials: ExternalAccountCredentials,
    federatedAccessToken: string
  ): Promise<CachedAccessToken> {
    const impersonationUrl =
      credentials.service_account_impersonation_url ?? this.buildImpersonationUrlFromEnv();
    const response = await fetch(impersonationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${federatedAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope: ["https://www.googleapis.com/auth/drive"],
        lifetime: "3600s"
      })
    });
    if (!response.ok) {
      throw new Error(`Google IAM impersonation error (${response.status}): ${await response.text()}`);
    }
    const json = (await response.json()) as { accessToken?: string; expireTime?: string };
    if (!json.accessToken) {
      throw new Error("Google IAM impersonation response did not contain accessToken.");
    }
    return {
      accessToken: json.accessToken,
      expiresAt: json.expireTime ? new Date(json.expireTime).getTime() : Date.now() + 3600_000
    };
  }

  private buildImpersonationUrlFromEnv(): string {
    const serviceAccount = process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim();
    if (!serviceAccount) {
      throw new Error("service_account_impersonation_url is missing. Set GOOGLE_IMPERSONATE_SERVICE_ACCOUNT if needed.");
    }
    return `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`;
  }

  private async createAwsSubjectToken(credentials: ExternalAccountCredentials): Promise<string> {
    const metadataHeaders = await this.getAwsMetadataHeaders();
    const region = await this.getAwsRegion(credentials.credential_source.region_url, metadataHeaders);
    const awsCredentials = await this.getAwsSecurityCredentials(credentials.credential_source.url, metadataHeaders);
    const requestUrl = credentials.credential_source.regional_cred_verification_url.replace("{region}", region);
    const signedRequest = this.signAwsGetCallerIdentityRequest(requestUrl, credentials.audience, region, awsCredentials);
    return encodeURIComponent(JSON.stringify(signedRequest));
  }

  private async getAwsMetadataHeaders(): Promise<Record<string, string>> {
    const response = await fetch("http://169.254.169.254/latest/api/token", {
      method: "PUT",
      headers: {
        "X-aws-ec2-metadata-token-ttl-seconds": "21600"
      }
    });
    if (!response.ok) {
      return {};
    }
    const token = await response.text();
    return token ? { "X-aws-ec2-metadata-token": token } : {};
  }

  private async getAwsRegion(regionUrl: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(regionUrl, { headers });
    if (!response.ok) {
      throw new Error(`AWS metadata region lookup failed (${response.status}).`);
    }
    const availabilityZone = (await response.text()).trim();
    if (!availabilityZone || availabilityZone.length < 2) {
      throw new Error("AWS metadata region lookup returned an invalid availability zone.");
    }
    return availabilityZone.slice(0, -1);
  }

  private async getAwsSecurityCredentials(metadataUrl: string, headers: Record<string, string>): Promise<AwsSecurityCredentials> {
    const roleResponse = await fetch(metadataUrl, { headers });
    if (!roleResponse.ok) {
      throw new Error(`AWS metadata IAM role lookup failed (${roleResponse.status}).`);
    }
    const roleName = (await roleResponse.text()).trim();
    if (!roleName) {
      throw new Error("AWS metadata did not return an IAM role name.");
    }

    const credentialsResponse = await fetch(`${metadataUrl}/${encodeURIComponent(roleName)}`, { headers });
    if (!credentialsResponse.ok) {
      throw new Error(`AWS metadata credential lookup failed (${credentialsResponse.status}).`);
    }
    const json = (await credentialsResponse.json()) as {
      AccessKeyId?: string;
      SecretAccessKey?: string;
      Token?: string;
    };
    if (!json.AccessKeyId || !json.SecretAccessKey) {
      throw new Error("AWS metadata returned incomplete credentials.");
    }
    return {
      accessKeyId: json.AccessKeyId,
      secretAccessKey: json.SecretAccessKey,
      token: json.Token
    };
  }

  private signAwsGetCallerIdentityRequest(
    url: string,
    audience: string,
    region: string,
    credentials: AwsSecurityCredentials
  ): { url: string; method: "POST"; headers: Array<{ key: string; value: string }> } {
    const requestUrl = new URL(url);
    const host = requestUrl.host;
    const service = "sts";
    const method = "POST";
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256Hex("");
    const canonicalUri = requestUrl.pathname || "/";
    const canonicalQuery = requestUrl.search.length > 1 ? requestUrl.search.slice(1) : "";
    const headerEntries = [
      ["host", host],
      ["x-amz-date", amzDate],
      ["x-goog-cloud-target-resource", audience],
      ...(credentials.token ? [["x-amz-security-token", credentials.token]] : [])
    ].sort(([left], [right]) => left.localeCompare(right));
    const canonicalHeaders = headerEntries.map(([key, value]) => `${key}:${value.trim()}\n`).join("");
    const signedHeaders = headerEntries.map(([key]) => key).join(";");
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest)
    ].join("\n");
    const signingKey = this.getAwsSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorizationHeader =
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers = [
      { key: "Authorization", value: authorizationHeader },
      { key: "host", value: host },
      { key: "x-amz-date", value: amzDate },
      { key: "x-goog-cloud-target-resource", value: audience },
      ...(credentials.token ? [{ key: "x-amz-security-token", value: credentials.token }] : [])
    ];

    return {
      url: requestUrl.toString(),
      method,
      headers
    };
  }

  private getAwsSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    return createHmac("sha256", kService).update("aws4_request").digest();
  }

  private sha256Hex(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private toAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  }

  private async loadCredentials(): Promise<GoogleCredentials> {
    if (!this.credentialsPromise) {
      this.credentialsPromise = this.readCredentials();
    }
    const credentials = await this.credentialsPromise;
    if (!credentials) {
      throw new Error("Google credentials were not found.");
    }
    return credentials;
  }

  private async readCredentials(): Promise<GoogleCredentials | null> {
    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!credentialPath) {
      return null;
    }

    const raw = await readFile(credentialPath, "utf8");
    const parsed = JSON.parse(raw) as
      | Partial<ServiceAccountCredentials>
      | Partial<ExternalAccountCredentials>
      | Record<string, unknown>;

    if (this.isRecord(parsed) && parsed.type === "service_account") {
      const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : "";
      const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";
      const tokenUri = typeof parsed.token_uri === "string" ? parsed.token_uri : undefined;
      if (!clientEmail || !privateKey) {
        throw new Error("Google service account credentials are invalid.");
      }
      return {
        type: "service_account",
        client_email: clientEmail,
        private_key: privateKey,
        token_uri: tokenUri
      };
    }

    if (this.isRecord(parsed) && parsed.type === "external_account") {
      const credentialSource = this.isRecord(parsed.credential_source) ? parsed.credential_source : null;
      const audience = typeof parsed.audience === "string" ? parsed.audience : "";
      const subjectTokenType = typeof parsed.subject_token_type === "string" ? parsed.subject_token_type : "";
      const tokenUrl = typeof parsed.token_url === "string" ? parsed.token_url : "";
      const serviceAccountImpersonationUrl =
        typeof parsed.service_account_impersonation_url === "string"
          ? parsed.service_account_impersonation_url
          : undefined;
      const regionUrl = credentialSource && typeof credentialSource.region_url === "string" ? credentialSource.region_url : "";
      const metadataUrl = credentialSource && typeof credentialSource.url === "string" ? credentialSource.url : "";
      const verificationUrl =
        credentialSource && typeof credentialSource.regional_cred_verification_url === "string"
          ? credentialSource.regional_cred_verification_url
          : "";
      if (
        !audience ||
        !subjectTokenType ||
        !tokenUrl ||
        !regionUrl ||
        !metadataUrl ||
        !verificationUrl
      ) {
        throw new Error("Google external_account credentials are invalid.");
      }
      return {
        type: "external_account",
        audience,
        subject_token_type: subjectTokenType,
        token_url: tokenUrl,
        service_account_impersonation_url: serviceAccountImpersonationUrl,
        credential_source: {
          environment_id:
            credentialSource && typeof credentialSource.environment_id === "string"
              ? credentialSource.environment_id
              : "aws1",
          region_url: regionUrl,
          url: metadataUrl,
          regional_cred_verification_url: verificationUrl
        }
      };
    }

    throw new Error("Unsupported Google credential type. Expected service_account or external_account.");
  }

  private toBase64Url(value: string): string {
    return Buffer.from(value).toString("base64url");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
