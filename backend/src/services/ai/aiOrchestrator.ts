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
   * Process customer message with verified catalog tools
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
      // Extract city if present
      const cityMatches = text.match(/(?:from|se|in|at)\s+([A-Za-z]+)/i);
      const extractedCity = cityMatches ? cityMatches[1] : undefined;

      let reply =
        "Thank you for your interest in RN Valves Dealership! Our sales manager will contact you for wholesale & dealer pricing. May I confirm your business name?";
      if (lang === "hi" || lang === "hinglish") {
        reply =
          "RN Valves dealership mein ruchi dikhane ke liye dhanyawad! Humari sales team aapse bulk pricing ke liye jald sampark karegi. Kripya apni firm/dukaan ka naam batayein?";
      }

      return {
        intent: "dealer_inquiry",
        language: lang,
        replyText: reply,
        requiresHumanHandover: true, // Dealer leads are prioritized for human sales follow-up
        leadData: {
          customerName: params.customerName,
          businessType: lower.includes("distributor") ? "Distributor" : "Dealer",
          city: extractedCity,
        },
      };
    }

    // 4. Product Search & Price Inquiry
    // Extract potential product search terms (e.g. "PTMT pillar cock", "bib cock", "angle valve", "RN-102")
    const searchResults = await ProductRepository.searchProducts(text, 3);

    if (searchResults && searchResults.length > 0) {
      const top = searchResults[0];
      const price = top.inSelling || top.inMrp || top.price;

      let reply = "";
      if (lang === "hi" || lang === "hinglish") {
        reply = `*${top.name}* (Code: ${top.code})\n\n`;
        reply += `💰 Approved Price: ₹${price}\n`;
        reply += `📦 Stock Status: ${top.stockStatus}\n`;
        if (top.residentialWarranty) reply += `🛡️ Warranty: ${top.residentialWarranty} Years\n`;
        reply += `\nKya aapko single piece chahiye ya bulk/dealership quantity?`;
      } else if (lang === "mr") {
        reply = `*${top.name}* (Code: ${top.code})\n\n`;
        reply += `💰 Kimat: ₹${price}\n`;
        reply += `📦 Stock: ${top.stockStatus}\n`;
        reply += `\nTumhala single piece hawa ahe ki bulk order sathi?`;
      } else if (lang === "bn") {
        reply = `*${top.name}* (Code: ${top.code})\n\n`;
        reply += `💰 Dam: ₹${price}\n`;
        reply += `📦 Stock: ${top.stockStatus}\n`;
        reply += `\nApni ki single piece chaichhen naki bulk quantity?`;
      } else {
        reply = `*${top.name}* (Code: ${top.code})\n\n`;
        reply += `💰 Approved Price: ₹${price}\n`;
        reply += `📦 Stock Status: ${top.stockStatus}\n`;
        if (top.residentialWarranty) reply += `🛡️ Warranty: ${top.residentialWarranty} Years\n`;
        reply += `\nAre you looking for a single piece or bulk dealer quantity?`;
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

    // 5. Default Polite Multilingual Welcome
    let defaultReply =
      "Welcome to RN Valves & Faucets! How can I assist you today? You can ask about our taps, showers, PTMT products, or request our catalogue.";
    if (lang === "hi" || lang === "hinglish") {
      defaultReply =
        "RN Valves & Faucets mein aapka swagat hai! Hum aapki kya sahayata kar sakte hain? Aap taps, showers, PTMT products ya product catalogue ke baare mein pooch sakte hain.";
    }

    return {
      intent: "general_faq",
      language: lang,
      replyText: defaultReply,
      requiresHumanHandover: false,
    };
  }
}
