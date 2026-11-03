import { ProductRepository } from "../../repositories/ProductRepository.js";
import { config } from "../../config/env.js";

export interface AiDecision {
  intent: "product_search" | "price_inquiry" | "catalogue_request" | "dealer_inquiry" | "human_handover" | "general_faq";
  language: "hi" | "en" | "mr" | "bn" | "hinglish";
  replyText: string;
  mediaUrl?: string;
  mediaType?: "image" | "document";
  mediaCaption?: string;
  mediaFileName?: string;
  requiresHumanHandover: boolean;
  leadData?: {
    customerName?: string;
    businessName?: string;
    businessType?: string;
    city?: string;
    productInterest?: string[];
  };
}

export class AiOrchestrator {
  /**
   * Call Google Gemini API (gemini-3.8-flash)
   */
  static async callGemini(userMessage: string, context: string = ""): Promise<string | null> {
    if (!config.GEMINI_API_KEY) {
      console.warn("⚠️ [AiOrchestrator] GEMINI_API_KEY is not configured.");
      return null;
    }

    // Force gemini-3.8-flash (replaces deprecated gemini-1.5-flash)
    const model =
      !config.GEMINI_MODEL || config.GEMINI_MODEL.includes("1.5")
        ? "gemini-3.8-flash"
        : config.GEMINI_MODEL;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`;

    const systemPrompt = `You are the polite, knowledgeable WhatsApp sales assistant for "RN Valves & Faucets Private Limited" - a premier Indian manufacturer of bathroom fittings, faucets, brass valves, PTMT taps, and sanitaryware.
Guidance:
1. Reply in the exact same language and tone as the customer (Hindi, Hinglish, Marathi, or English).
2. Keep answers short, crisp, and friendly (max 2-3 short sentences, ideal for WhatsApp reading).
3. Mention that for official catalogue and bulk dealer quotes, our team is always ready to assist.
4. For dealer inquiries, politely ask for their shop/firm name and city so the sales team can provide wholesale rates.
${context ? `\nVerified Product Catalog Context:\n${context}` : ""}`;

    try {
      console.log(`🤖 [AiOrchestrator] Calling Gemini API (${model})...`);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nCustomer Message: "${userMessage}"` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300,
          },
        }),
      });

      const data: any = await response.json();

      if (!response.ok) {
        console.error("❌ [AiOrchestrator] Gemini API returned error:", data?.error?.message || response.status);
        return null;
      }

      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
        console.log(`✅ [AiOrchestrator] Gemini generated response (${reply.length} chars).`);
        return reply.trim();
      }
      return null;
    } catch (err: any) {
      console.error("❌ [AiOrchestrator] Gemini fetch error:", err.message);
      return null;
    }
  }

  /**
   * Fast multilingual language detection
   */
  static detectLanguage(text: string): "hi" | "en" | "mr" | "bn" | "hinglish" {
    const t = text.toLowerCase();

    // Bengali detection
    if (/[\u0980-\u09FF]/.test(text) || /\b(ami|tumi|apni|kothay|dorkar|koto|dam)\b/i.test(t)) {
      return "bn";
    }

    // Marathi detection
    if (/\b(mala|pahije|ahe|kiti|dava|bhau|kay|kuthe)\b/i.test(t)) {
      return "mr";
    }

    // Hindi (Devanagari)
    if (/[\u0900-\u097F]/.test(text)) {
      return "hi";
    }

    // Hinglish detection
    if (
      /\b(chahiye|kya|hai|kitna|bhai|mujhe|price|rate|kaha|kaise|milega|bhejo|dekhna)\b/i.test(t)
    ) {
      return "hinglish";
    }

    return "en";
  }

  /**
   * Process customer message with verified catalog tools + Gemini AI
   */
  static async processMessage(params: {
    messageText: string;
    phone: string;
    customerName?: string;
  }): Promise<AiDecision> {
    const text = params.messageText.trim();
    const lower = text.toLowerCase();
    const lang = this.detectLanguage(text);

    // 1. Human Handover Intent Detection
    const handoverKeywords = [
      "agent",
      "human",
      "executive",
      "baat karni",
      "call me",
      "call karo",
      "insan",
      "manager",
      "representative",
      "owner",
    ];

    const wantsHandover = handoverKeywords.some((kw) => lower.includes(kw));

    if (wantsHandover) {
      let reply = "I am connecting you with our senior representative right away. Please hold on.";
      if (lang === "hi" || lang === "hinglish") {
        reply = "Main aapko humare sales team executive se connect kar raha hoon. Kripya thoda intezar karein.";
      } else if (lang === "mr") {
        reply = "Me tumhala amchya sales team sobat jodtoy. Krupaya thoda vel thamba.";
      } else if (lang === "bn") {
        reply = "Ami apnake amader sales team er sathe connect korchi. Ektu opekkha korun.";
      }

      return {
        intent: "human_handover",
        language: lang,
        replyText: reply,
        requiresHumanHandover: true,
      };
    }

    // 2. Catalogue PDF Request
    if (lower.includes("catalogue") || lower.includes("catalog") || lower.includes("pdf") || lower.includes("brochure")) {
      const catalogues = await ProductRepository.getCatalogue();
      const pdf = catalogues.length > 0 ? catalogues[0] : null;

      let reply = "Here is the official RN Valves & Faucets product catalogue.";
      if (lang === "hi" || lang === "hinglish") {
        reply = "Yeh lijiye RN Valves & Faucets ka official catalogue PDF.";
      }

      if (pdf && pdf.pdf) {
        return {
          intent: "catalogue_request",
          language: lang,
          replyText: reply,
          mediaUrl: pdf.pdf,
          mediaType: "document",
          mediaCaption: "RN Valves & Faucets Product Catalogue",
          mediaFileName: "RN_Valves_Catalogue.pdf",
          requiresHumanHandover: false,
        };
      }
    }

    // 3. Dealer / Distributor Intent
    if (
      lower.includes("dealer") ||
      lower.includes("distributor") ||
      lower.includes("dealership") ||
      lower.includes("wholesale") ||
      lower.includes("bulk")
    ) {
      const cityMatches = text.match(/(?:from|se|in|at)\s+([A-Za-z]+)/i);
      const extractedCity = cityMatches ? cityMatches[1] : undefined;

      // Ask Gemini for a warm dealer response
      const geminiDealerReply = await this.callGemini(
        text,
        "Customer is interested in dealership or wholesale bulk purchase. Acknowledge enthusiastically and ask for shop/firm name and city."
      );

      let reply =
        geminiDealerReply ||
        "Thank you for your interest in RN Valves Dealership! Our sales manager will contact you for wholesale & dealer pricing. May I confirm your business name and city?";

      return {
        intent: "dealer_inquiry",
        language: lang,
        replyText: reply,
        requiresHumanHandover: true,
        leadData: {
          customerName: params.customerName,
          businessType: lower.includes("distributor") ? "Distributor" : "Dealer",
          city: extractedCity,
        },
      };
    }

    // 4. Product Search & Price Inquiry
    const searchResults = await ProductRepository.searchProducts(text, 3);

    if (searchResults && searchResults.length > 0) {
      const top = searchResults[0];
      const price = top.inSelling || top.inMrp || top.price;

      // Provide verified product context to Gemini
      const catalogContext = `Product: ${top.name}\nCode: ${top.code}\nApproved Price: Rs ${price}\nStock: ${top.stockStatus}\nWarranty: ${top.residentialWarranty || 5} Years`;

      const geminiReply = await this.callGemini(text, catalogContext);

      let reply = "";
      if (geminiReply) {
        reply = geminiReply;
      } else {
        // Fallback structured template
        reply = `*${top.name}* (Code: ${top.code})\n\n`;
        reply += `💰 Approved Price: ₹${price}\n`;
        reply += `📦 Stock Status: ${top.stockStatus}\n`;
        if (top.residentialWarranty) reply += `🛡️ Warranty: ${top.residentialWarranty} Years\n`;
        reply += `\nKya aapko single piece chahiye ya bulk/dealership quantity?`;
      }

      return {
        intent: "price_inquiry",
        language: lang,
        replyText: reply,
        mediaUrl: top.image ? `${config.MEDIA_CDN_URL}/${top.image.replace(/^\//, "")}` : undefined,
        mediaType: top.image ? "image" : undefined,
        mediaCaption: `${top.name} - ₹${price}`,
        requiresHumanHandover: false,
        leadData: {
          productInterest: [top.code],
        },
      };
    }

    // 5. General AI Inquiry (Powered by Gemini)
    const geminiGeneralReply = await this.callGemini(text);

    let defaultReply =
      geminiGeneralReply ||
      "Welcome to RN Valves & Faucets! How can I assist you today? You can ask about our taps, showers, PTMT products, or request our catalogue.";

    return {
      intent: "general_faq",
      language: lang,
      replyText: defaultReply,
      requiresHumanHandover: false,
    };
  }
}
