import { config } from "../../config/env.js";

export interface ChatwootContact {
  id: number;
  name: string;
  phone_number: string;
  email?: string;
  identifier?: string;
}

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  status: "open" | "resolved" | "pending" | "snoozed";
  contact_inbox: {
    contact_id: number;
  };
}

export interface ChatwootMessage {
  id: number;
  content: string;
  message_type: "incoming" | "outgoing" | "template";
  private: boolean;
  sender?: {
    id: number;
    name: string;
    type: "user" | "contact";
  };
}

export class ChatwootClient {
  private baseUrl: string;
  private apiAccessToken: string;
  private accountId: string;
  private inboxId: string;

  constructor() {
    this.baseUrl = config.CHATWOOT_BASE_URL.replace(/\/$/, "");
    this.apiAccessToken = config.CHATWOOT_API_ACCESS_TOKEN;
    this.accountId = config.CHATWOOT_ACCOUNT_ID;
    this.inboxId = config.CHATWOOT_INBOX_ID;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      api_access_token: this.apiAccessToken,
    };
  }

  /**
   * Find an existing contact by phone number or create a new contact in Chatwoot
   */
  async findOrCreateContact(params: {
    phone: string;
    name: string;
    email?: string;
    city?: string;
  }): Promise<ChatwootContact> {
    if (!this.apiAccessToken) {
      // Mock / Offline Test Environment
      return {
        id: Math.floor(Math.random() * 100000) + 1,
        name: params.name,
        phone_number: params.phone,
        email: params.email,
      };
    }

    try {
      // 1. Search existing contact by phone number
      const searchUrl = `${this.baseUrl}/api/v1/accounts/${this.accountId}/contacts/search?q=${encodeURIComponent(
        params.phone
      )}`;
      const searchRes = await fetch(searchUrl, { headers: this.headers });
      if (searchRes.ok) {
        const searchData: any = await searchRes.json();
        const existing = searchData?.payload?.[0];
        if (existing) {
          return existing;
        }
      }

      // 2. Create new contact
      const createUrl = `${this.baseUrl}/api/v1/accounts/${this.accountId}/contacts`;
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          inbox_id: this.inboxId,
          name: params.name,
          phone_number: params.phone,
          email: params.email || undefined,
          custom_attributes: {
            city: params.city || "",
            channel: "WhatsApp",
          },
        }),
      });

      const createData: any = await createRes.json();
      return createData?.payload?.contact || createData;
    } catch (error: any) {
      console.error("[ChatwootClient] Failed to findOrCreateContact:", error.message);
      throw error;
    }
  }

  /**
   * Find or create an open conversation for a contact in the WhatsApp API inbox
   */
  async findOrCreateConversation(contactId: number): Promise<ChatwootConversation> {
    if (!this.apiAccessToken) {
      return {
        id: Math.floor(Math.random() * 100000) + 100,
        inbox_id: parseInt(this.inboxId, 10),
        status: "open",
        contact_inbox: { contact_id: contactId },
      };
    }

    try {
      // 1. Check contact's existing conversations
      const listUrl = `${this.baseUrl}/api/v1/accounts/${this.accountId}/contacts/${contactId}/conversations`;
      const listRes = await fetch(listUrl, { headers: this.headers });
      if (listRes.ok) {
        const listData: any = await listRes.json();
        const openConv = listData?.payload?.find(
          (c: any) => c.status === "open" && String(c.inbox_id) === String(this.inboxId)
        );
        if (openConv) {
          return openConv;
        }
      }

      // 2. Create new conversation
      const createUrl = `${this.baseUrl}/api/v1/accounts/${this.accountId}/conversations`;
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          inbox_id: this.inboxId,
          contact_id: contactId,
          status: "open",
        }),
      });

      const createData: any = await createRes.json();
      return createData;
    } catch (error: any) {
      console.error("[ChatwootClient] Failed to findOrCreateConversation:", error.message);
      throw error;
    }
  }

  /**
   * Sync a message into a Chatwoot conversation (incoming from customer or outgoing from AI/bot)
   */
  async createMessage(params: {
    conversationId: number;
    content: string;
    messageType: "incoming" | "outgoing";
    isPrivate?: boolean;
  }): Promise<ChatwootMessage> {
    if (!this.apiAccessToken) {
      return {
        id: Math.floor(Math.random() * 100000) + 1000,
        content: params.content,
        message_type: params.messageType,
        private: params.isPrivate || false,
      };
    }

    try {
      const url = `${this.baseUrl}/api/v1/accounts/${this.accountId}/conversations/${params.conversationId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          content: params.content,
          message_type: params.messageType,
          private: params.isPrivate || false,
        }),
      });

      const data: any = await res.json();
      return data;
    } catch (error: any) {
      console.error("[ChatwootClient] Failed to createMessage:", error.message);
      throw error;
    }
  }

  /**
   * Fetch messages of a Chatwoot conversation
   */
  async getConversationMessages(conversationId: number): Promise<any[]> {
    if (!this.apiAccessToken) return [];

    try {
      const url = `${this.baseUrl}/api/v1/accounts/${this.accountId}/conversations/${conversationId}/messages`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return [];

      const data: any = await res.json();
      const messages = (data?.payload || []).map((m: any) => {
        let content = (m.content || "").trim();
        if (!content) {
          if (m.attachments && m.attachments.length > 0) {
            const att = m.attachments[0];
            content = `[Attachment: ${att.file_type || "file"}]`;
          } else if (m.message_type === 0) {
            content = "👋 [Incoming WhatsApp Message]";
          } else {
            content = "[Response sent]";
          }
        }
        return {
          id: String(m.id),
          sender: m.message_type === 0 ? "customer" : "bot",
          content,
          timestamp: m.created_at ? new Date(m.created_at * 1000).toISOString() : new Date().toISOString(),
          type: m.attachments && m.attachments.length > 0 ? "media" : "text",
        };
      });
      return messages;
    } catch (error: any) {
      console.warn("[ChatwootClient] Failed to fetch conversation messages:", error.message);
      return [];
    }
  }

  /**
   * Assign conversation to a specific human agent in Chatwoot
   */
  async assignAgent(conversationId: number, agentId: number): Promise<void> {
    if (!this.apiAccessToken) return;

    try {
      const url = `${this.baseUrl}/api/v1/accounts/${this.accountId}/conversations/${conversationId}/assignments`;
      await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ assignee_id: agentId }),
      });
    } catch (error: any) {
      console.warn("[ChatwootClient] Failed to assign agent:", error.message);
    }
  }
}

export const chatwootClient = new ChatwootClient();
