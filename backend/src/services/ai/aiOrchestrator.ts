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

    const systemPrompt = `You are "RN Sahayak", the friendly, knowledgeable WhatsApp sales executive for "RN Valves & Faucets Private Limited" (India's premier manufacturer of high-quality taps, brass ball valves, luxury faucets, showers, and PTMT bathroom fittings).

Response Guidelines:
1. Always speak warmly and politely in the customer's language (pure Hindi, Hinglish, or English).
2. Answer their question completely with accurate product details, rates, and catalog links if available in context.
3. If they inquire about a product or price, clearly state the price (selling/MRP), item code, warranty, and availability.
4. For dealer, distributor, or bulk wholesale inquiries, warmly welcome them and ask for their firm/shop name and city so the regional sales manager can share wholesale dealer price lists.
5. Keep formatting clean with emojis (📦, 💰, 🛡️, 📄, 📞) and bullet points. Never cut off your message mid-sentence.
${context ? `\nVerified Product / Catalog Context:\n${context}` : ""}`;

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
            maxOutputTokens: 500,
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

    // 2. Pure Greeting Detection (e.g. "hi", "hello", "namaste", "hey")
    const greetings = [
      "hi", "hello", "hey", "namaste", "pranam", "good morning",
      "good evening", "good afternoon", "hlo", "hii", "hi sir", "hello sir"
    ];
    const cleanWords = lower.replace(/[^a-zA-Z]/g, " ").trim();
    const isPureGreeting = greetings.includes(cleanWords) || (text.length <= 10 && greetings.some((g) => lower.startsWith(g)));

    if (isPureGreeting) {
      let welcomeMsg = "";
      if (lang === "hi" || lang === "hinglish") {
        welcomeMsg = `Namaste! *RN Valves & Faucets* mein aapka swagat hai! 🙏✨\n\nMain hoon *RN Sahayak*, aapka digital sales assistant. Hum high-quality taps, brass ball valves, luxury faucets, showers aur PTMT bathroom fittings ke manufacturer hain.\n\nHum aapki kya madad kar sakte hain?\n• 📦 *Product Inquiry & Rates* (Article code ya product ka naam bhejiye)\n• 📄 *Catalogue / Brochure*\n• 🤝 *Dealership & Wholesale Inquiries*\n• 🛡️ *Warranty & Support*`;
      } else {
        welcomeMsg = `Hello! Welcome to *RN Valves & Faucets*! 🙏✨\n\nI am *RN Sahayak*, your personal assistant. We are India's premier manufacturer of high-quality brass taps, luxury faucets, ball valves, showers, and PTMT bathroom fittings.\n\nHow can I assist you today?\n• 📦 *Product Inquiry & Prices* (Share article code or product name)\n• 📄 *Product Catalog / Brochure*\n• 🤝 *Dealership & Wholesale Inquiries*\n• 🛡️ *Warranty Support*`;
      }

      return {
        intent: "general_faq",
        language: lang,
        replyText: welcomeMsg,
        requiresHumanHandover: false,
      };
    }

    // 2. Catalogue PDF Request
    if (lower.includes("catalogue") || lower.includes("catalog") || lower.includes("pdf") || lower.includes("brochure")) {
      const catalogues = await ProductRepository.getCatalogue();
      const pdf = catalogues.length > 0 ? catalogues[0] : null;
      const pdfUrl = pdf?.pdf || "https://rnvalves.com/catalogues/RN_Valves_Complete_Catalogue.pdf";

      let reply = "";
      if (lang === "hi" || lang === "hinglish") {
        reply = `Namaste! Yeh lijiye RN Valves & Faucets ka official complete product catalogue:\n\n📄 *Catalogue PDF Link:* ${pdfUrl}\n\nAapko kis category (Taps, Showers, Brass Ball Valves, ya PTMT Fittings) ke baare mein quotation chahiye?`;
      } else {
        reply = `Hello! Here is the official RN Valves & Faucets product catalogue:\n\n📄 *Catalogue PDF Link:* ${pdfUrl}\n\nWhich product line (Faucets, Brass Valves, Showers, or PTMT) can we assist you with today?`;
      }

      return {
        intent: "catalogue_request",
        language: lang,
        replyText: reply,
        mediaUrl: pdfUrl,
        mediaType: "document",
        mediaCaption: "RN Valves & Faucets Complete Product Catalogue",
        mediaFileName: "RN_Valves_Catalogue.pdf",
        requiresHumanHandover: false,
      };
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
        "Customer is interested in dealership or wholesale bulk purchase. Acknowledge enthusiastically, introduce RN Valves as a premier manufacturer, and ask for their shop/firm name and city so the sales team can share wholesale dealer price lists."
      );

      let reply =
        geminiDealerReply ||
        "Namaste! RN Valves dealership & wholesale mein ruchi dikhane ke liye dhanyawad! Humari sales team aapse bulk pricing ke liye jald sampark karegi. Kripya apni firm/dukaan ka naam aur city batayein?";

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
      const price = top.inSelling || top.inMrp || top.price || 0;
      const mrp = top.inMrp || top.price || 0;

      // Construct verified, accurate pricing card
      let verifiedCard = "";
      if (lang === "hi" || lang === "hinglish") {
        verifiedCard = `Namaste! Yeh lijiye *${top.name}* ki verified details:\n\n`;
        verifiedCard += `🔖 *Item Code:* ${top.code}\n`;
        if (price > 0) {
          verifiedCard += `💰 *Approved Price:* ₹${price}/-`;
          if (mrp > price) verifiedCard += ` (MRP: ₹${mrp}/-)`;
          verifiedCard += `\n`;
        } else {
          verifiedCard += `💰 *Pricing:* Wholesale & Dealer Rates available on request\n`;
        }
        verifiedCard += `📦 *Stock Status:* ${top.stockStatus}\n`;
        if (top.residentialWarranty) verifiedCard += `🛡️ *Warranty:* ${top.residentialWarranty} Saal\n`;
        if (top.material) verifiedCard += `🧱 *Material:* ${top.material}\n`;
        verifiedCard += `\nKya aapko single piece retail chahiye ya wholesale dealer quantity? Dealer rates ke liye kripya apni city aur dukan ka naam batayein.`;
      } else {
        verifiedCard = `Hello! Here are the verified details for *${top.name}*:\n\n`;
        verifiedCard += `🔖 *Item Code:* ${top.code}\n`;
        if (price > 0) {
          verifiedCard += `💰 *Approved Price:* ₹${price}/-`;
          if (mrp > price) verifiedCard += ` (MRP: ₹${mrp}/-)`;
          verifiedCard += `\n`;
        } else {
          verifiedCard += `💰 *Pricing:* Wholesale & Dealer Rates available on request\n`;
        }
        verifiedCard += `📦 *Stock Status:* ${top.stockStatus}\n`;
        if (top.residentialWarranty) verifiedCard += `🛡️ *Warranty:* ${top.residentialWarranty} Years\n`;
        if (top.material) verifiedCard += `🧱 *Material:* ${top.material}\n`;
        verifiedCard += `\nAre you looking for retail purchase or bulk dealer pricing? For wholesale rates, please share your shop name and city.`;
      }

      return {
        intent: "price_inquiry",
        language: lang,
        replyText: verifiedCard,
        mediaUrl: top.image
          ? top.image.startsWith("http")
            ? top.image
            : `${config.MEDIA_CDN_URL}/${top.image.replace(/^\//, "")}`
          : undefined,
        mediaType: top.image ? "image" : undefined,
        mediaCaption: `*${top.name}* (Code: ${top.code})`,
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
      "Namaste! RN Valves & Faucets mein aapka swagat hai. Hum bathroom fittings, brass ball valves, luxury faucets aur PTMT products ke manufacturer hain. Aap kis product ki jankari ya catalogue chahte hain?";

    return {
      intent: "general_faq",
      language: lang,
      replyText: defaultReply,
      requiresHumanHandover: false,
    };
  }
}
