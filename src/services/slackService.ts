import { SocketModeClient } from "@slack/socket-mode";
import { AppConfig } from "../types.js";

type SlackPostMessageResponse = {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

type SlackHistoryMessage = Record<string, unknown> & {
  ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  thread_ts?: string;
};

type SlackConversationHistoryResponse = {
  ok: true;
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
  messages?: SlackHistoryMessage[];
};

type SlackCommandHandler = (payload: { text: string; channel: string; user?: string }) => Promise<string | void>;
type SlackInteractiveHandler = (payload: Record<string, unknown>) => Promise<void>;
type SlackEventHandler = (payload: { type: string; event: Record<string, unknown>; envelope: Record<string, unknown> }) => Promise<void>;

export class SlackService {
  private socketClient: SocketModeClient | null = null;
  private started = false;

  isConfigured(config: AppConfig): boolean {
    return Boolean(this.resolveBotToken() && this.resolveAppToken() && this.resolveChannel(config));
  }

  async testConnection(config: AppConfig): Promise<{ ok: true; channel: string }> {
    const result = await this.postMessage(config, "Legal Bridge 接続テスト: Slack 通知は正常です。");
    return { ok: true, channel: result.channel ?? this.resolveChannel(config) };
  }

  async postMessage(config: AppConfig, text: string, channel?: string): Promise<SlackPostMessageResponse> {
    return this.postBlocks(config, { text, channel });
  }

  async postBlocks(
    config: AppConfig,
    input: {
      text: string;
      channel?: string;
      blocks?: Array<Record<string, unknown>>;
    }
  ): Promise<SlackPostMessageResponse> {
    const token = this.resolveBotToken();
    const targetChannel = input.channel ?? this.resolveChannel(config);
    if (!token || !targetChannel) {
      throw new Error("Slack credentials are not configured.");
    }

    return this.callApi<SlackPostMessageResponse>(token, "chat.postMessage", {
      channel: targetChannel,
      text: input.text,
      blocks: input.blocks
    });
  }

  async updateMessage(
    _config: AppConfig,
    input: {
      channel: string;
      ts: string;
      text: string;
      blocks?: Array<Record<string, unknown>>;
    }
  ): Promise<SlackPostMessageResponse> {
    const token = this.resolveBotToken();
    if (!token) {
      throw new Error("Slack credentials are not configured.");
    }
    return this.callApi<SlackPostMessageResponse>(token, "chat.update", input);
  }

  async openModal(triggerId: string, view: Record<string, unknown>): Promise<void> {
    const token = this.resolveBotToken();
    if (!token) {
      throw new Error("Slack credentials are not configured.");
    }
    await this.callApi(token, "views.open", {
      trigger_id: triggerId,
      view
    });
  }

  async getFileInfo(fileId: string): Promise<Record<string, unknown>> {
    const token = this.resolveBotToken();
    if (!token) {
      throw new Error("Slack credentials are not configured.");
    }
    const response = await this.callApi<{ ok: true; file: Record<string, unknown> }>(token, "files.info", {
      file: fileId
    });
    return response.file;
  }

  async fetchChannelHistory(
    channel: string,
    input?: {
      oldest?: string;
      latest?: string;
      limit?: number;
    }
  ): Promise<Array<Record<string, unknown>>> {
    const token = this.resolveBotToken();
    if (!token) {
      throw new Error("Slack credentials are not configured.");
    }

    const messages: SlackHistoryMessage[] = [];
    const requestedLimit = Math.max(Math.min(input?.limit ?? 100, 200), 1);
    let cursor = "";

    while (messages.length < requestedLimit) {
      const remaining = requestedLimit - messages.length;
      const response = await this.callApi<SlackConversationHistoryResponse>(token, "conversations.history", {
        channel,
        limit: Math.min(remaining, 100),
        oldest: input?.oldest,
        latest: input?.latest,
        cursor: cursor || undefined,
        inclusive: true
      });

      messages.push(...(response.messages ?? []));
      cursor = String(response.response_metadata?.next_cursor ?? "").trim();
      if (!response.has_more || !cursor) {
        break;
      }
    }

    return messages;
  }

  async startSocketMode(
    config: AppConfig,
    onCommand: SlackCommandHandler,
    onInteractive?: SlackInteractiveHandler,
    onEvent?: SlackEventHandler
  ): Promise<boolean> {
    if (!this.isConfigured(config)) {
      return false;
    }
    if (this.started) {
      return true;
    }

    const client = new SocketModeClient({
      appToken: this.resolveAppToken()
    });

    client.on("slash_commands", async ({ body, ack }) => {
      await ack();
      const reply = await onCommand({
        text: body.text ?? "",
        channel: body.channel_id,
        user: body.user_id
      });
      if (reply) {
        await this.postMessage(config, reply, body.channel_id);
      }
    });

    client.on("events_api", async ({ body, ack }) => {
      await ack();
      const event = body.event;
      if (!event) {
        console.log("[SlackSocket] events_api received without event body");
        return;
      }

      console.log("[SlackSocket] events_api received", {
        envelopeType: body.type ?? "",
        eventType: String(event.type ?? ""),
        subtype: "subtype" in event ? String(event.subtype ?? "") : "",
        channel: "channel" in event ? String(event.channel ?? "") : "",
        user: "user" in event ? String(event.user ?? "") : "",
        botId: "bot_id" in event ? String(event.bot_id ?? "") : ""
      });

      if (onEvent) {
        await onEvent({
          type: String(event.type ?? ""),
          event: event as Record<string, unknown>,
          envelope: body as Record<string, unknown>
        });
      }

      if ("bot_id" in event) {
        console.log("[SlackSocket] events_api ignored bot event", {
          eventType: String(event.type ?? ""),
          subtype: "subtype" in event ? String(event.subtype ?? "") : "",
          channel: "channel" in event ? String(event.channel ?? "") : ""
        });
        return;
      }

      if (event.type !== "app_mention") {
        console.log("[SlackSocket] events_api ignored non-app_mention", {
          eventType: String(event.type ?? ""),
          subtype: "subtype" in event ? String(event.subtype ?? "") : "",
          channel: "channel" in event ? String(event.channel ?? "") : ""
        });
        return;
      }

      const reply = await onCommand({
        text: "text" in event ? String(event.text ?? "").replace(/<@[^>]+>/g, "").trim() : "",
        channel: "channel" in event ? String(event.channel) : "",
        user: "user" in event ? String(event.user) : undefined
      });
      if (reply && "channel" in event) {
        await this.postMessage(config, reply, String(event.channel));
      }
    });

    client.on("interactive", async ({ body, ack }) => {
      await ack();
      if (onInteractive) {
        await onInteractive(body as Record<string, unknown>);
      }
    });

    client.on("error", (error) => {
      console.error("Slack Socket Mode error", error);
    });

    await client.start();
    this.socketClient = client;
    this.started = true;
    return true;
  }

  async stopSocketMode(): Promise<void> {
    if (!this.socketClient) {
      return;
    }
    await this.socketClient.disconnect();
    this.socketClient = null;
    this.started = false;
  }

  private resolveBotToken(): string {
    return (process.env.SLACK_BOT_TOKEN || "").trim();
  }

  private resolveAppToken(): string {
    return (process.env.SLACK_APP_TOKEN || "").trim();
  }

  private resolveChannel(config: AppConfig): string {
    return (config.legalSlackChannel || process.env.LEGAL_SLACK_CHANNEL || "").trim();
  }

  private async callApi<T = { ok: boolean; error?: string }>(
    token: string,
    method: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string } & T;
    if (!response.ok || !payload.ok) {
      throw new Error(`Slack API error: ${payload.error ?? response.statusText}`);
    }
    return payload;
  }
}
