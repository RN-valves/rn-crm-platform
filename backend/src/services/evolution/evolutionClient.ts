import { config } from "../../config/env.js";

export interface SendTextMessageParams {
  number: string;
  text: string;
  delayMs?: number;
}

export interface SendMediaMessageParams {
  number: string;
  mediaUrl: string;
  mediaType: "image" | "document" | "audio" | "video";
  caption?: string;
  fileName?: string;
  delayMs?: number;
}

export interface EvolutionResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: any;
}

export let lastEvolutionError: string | null = null;
export let lastEvolutionSuccess: { number: string; messageId?: string; at: string } | null = null;

export class EvolutionClient {
  private baseUrl: string;
  private apiKey: string;
  private instanceName: string;

  constructor() {
    this.baseUrl = config.EVOLUTION_API_URL.replace(/\/$/, "");
    this.apiKey = config.EVOLUTION_API_KEY;
    this.instanceName = config.EVOLUTION_INSTANCE_NAME;
  }

  /**
   * Helper to format numbers into WhatsApp format:
   * e.g. "+91 98765-43210" -> "919876543210"
   */
  static cleanPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `91${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Send presence indicator (e.g. typing / composing)
   */
  async sendPresence(phone: string, presence: "composing" | "recording" | "paused" = "composing"): Promise<void> {
    const targetNumber = EvolutionClient.cleanPhoneNumber(phone);
    if (!this.apiKey) {
      console.log(`[EvolutionClient Mock] Presence '${presence}' -> ${targetNumber}`);
      return;
    }

    try {
      await fetch(`${this.baseUrl}/chat/sendPresence/${this.instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey,
        },
        body: JSON.stringify({
          number: targetNumber,
          presence,
          delay: 1200,
        }),
      });
    } catch (err: any) {
      console.warn(`[EvolutionClient] Failed to send presence: ${err.message}`);
    }
  }

  /**
   * Send WhatsApp Text Message via Evolution API v2.3.7
   */
  async sendTextMessage(params: SendTextMessageParams): Promise<EvolutionResponse> {
    const targetNumber = EvolutionClient.cleanPhoneNumber(params.number);

    if (!this.apiKey) {
      console.log(`[EvolutionClient Mock] Text -> ${targetNumber}: "${params.text.slice(0, 50)}..."`);
      return {
        success: true,
        messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      };
    }

    const url = `${this.baseUrl}/message/sendText/${this.instanceName}`;
    const payload = {
      number: targetNumber,
      text: params.text,
      options: {
        delay: params.delayMs || 1200,
        presence: "composing",
        linkPreview: true,
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
      }

      lastEvolutionError = null;
      lastEvolutionSuccess = {
        number: targetNumber,
        messageId: data?.key?.id || data?.messageId,
        at: new Date().toISOString(),
      };

      return {
        success: true,
        messageId: data?.key?.id || data?.messageId,
        raw: data,
      };
    } catch (error: any) {
      lastEvolutionError = `${error.message} (target: ${targetNumber})`;
      console.error(`[EvolutionClient] sendTextMessage failed to ${targetNumber}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send WhatsApp Media Message via Evolution API v2.3.7
   */
  async sendMediaMessage(params: SendMediaMessageParams): Promise<EvolutionResponse> {
    const targetNumber = EvolutionClient.cleanPhoneNumber(params.number);

    if (!this.apiKey) {
      console.log(`[EvolutionClient Mock] Media [${params.mediaType}] -> ${targetNumber}`);
      return {
        success: true,
        messageId: `mock_media_${Date.now()}`,
      };
    }

    const url = `${this.baseUrl}/message/sendMedia/${this.instanceName}`;
    const payload = {
      number: targetNumber,
      mediatype: params.mediaType,
      media: params.mediaUrl,
      caption: params.caption || "",
      fileName: params.fileName,
      options: {
        delay: params.delayMs || 1200,
        presence: "composing",
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
      }

      lastEvolutionError = null;
      lastEvolutionSuccess = {
        number: targetNumber,
        messageId: data?.key?.id || data?.messageId,
        at: new Date().toISOString(),
      };

      return {
        success: true,
        messageId: data?.key?.id || data?.messageId,
        raw: data,
      };
    } catch (error: any) {
      lastEvolutionError = `${error.message} (media target: ${targetNumber})`;
      console.error(`[EvolutionClient] sendMediaMessage failed to ${targetNumber}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fetch instance connection state
   */
  async getConnectionState(): Promise<{ state: string; instance: string }> {
    if (!this.apiKey) {
      return { state: "open (mock)", instance: this.instanceName };
    }

    const url = `${this.baseUrl}/instance/connectionState/${this.instanceName}`;
    try {
      const response = await fetch(url, {
        headers: { apikey: this.apiKey },
      });
      const data: any = await response.json();
      return {
        state: data?.instance?.state || data?.state || "unknown",
        instance: this.instanceName,
      };
    } catch (error: any) {
      return { state: "unreachable", instance: this.instanceName };
    }
  }
}

export const evolutionClient = new EvolutionClient();
