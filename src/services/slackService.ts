import { SocketModeClient } from "@slack/socket-mode";
import { AppConfig } from "../types.js";

type SlackPostMessageResponse = {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

type SlackCommandHandler = (payload: { text: string; channel: string; user?: string }) => Promise<string | void>;

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
    const token = this.resolveBotToken();
    const targetChannel = channel ?? this.resolveChannel(config);
    if (!token || !targetChannel) {
      throw new Error("Slack credentials are not configured.");
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({ channel: targetChannel, text })
    });

    const payload = (await response.json()) as SlackPostMessageResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(`Slack API error: ${payload.error ?? response.statusText}`);
    }
    return payload;
  }

  async startSocketMode(config: AppConfig, onCommand: SlackCommandHandler): Promise<boolean> {
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
      if (!event || "bot_id" in event || event.type !== "app_mention") {
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
}
