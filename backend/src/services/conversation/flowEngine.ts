import { getConversationStateModel, BotFlowState, IConversationState } from "../../models/ConversationState.js";
import { getConversationControlModel } from "../../models/ConversationControl.js";
import { SalesRepDirectory, SalesRep } from "./salesRepDirectory.js";
import { CatalogueDirectory, CatalogueCategory } from "./catalogueDirectory.js";
import { getLeadModel } from "../../models/Lead.js";
import { getContactModel } from "../../models/Contact.js";
import { getMessageModel } from "../../models/Message.js";
import { ProductRepository } from "../../repositories/ProductRepository.js";
import { outgoingMessagesQueue } from "../../queues/queueManager.js";
import { evolutionClient } from "../evolution/evolutionClient.js";
import { chatwootClient } from "../chatwoot/chatwootClient.js";

export interface FlowResponse {
  replyText: string;
  mediaUrl?: string;
  mediaType?: "image" | "document";
  mediaCaption?: string;
  mediaFileName?: string;
  ignoreMessage?: boolean;
}

export class FlowEngine {
  /**
   * Filter check (Spam, OTP, bank alerts, loops)
   */
  static isSpamOrFiltered(text: string, phone: string): boolean {
    const lower = text.toLowerCase();

    // 1. OTP pattern
    if (/\b(otp|one time password|verification code|is your code|secret code)\b/i.test(lower)) {
      console.log(`🛡️ [FlowEngine] Ignored OTP message from ${phone}`);
      return true;
    }

    // 2. Promo spam links
    if (/\b(bit\.ly|tinyurl|flat\s*\d+%\s*off|claim now|cashback|congratulations you won)\b/i.test(lower)) {
      console.log(`🛡️ [FlowEngine] Ignored promo spam from ${phone}`);
      return true;
    }

    return false;
  }

  /**
   * Dispatch real-time WhatsApp alert directly to Regional Sales Rep & Admin
   */
  static async dispatchRepWhatsAppAlert(
    rep: SalesRep,
    leadDetails: {
      customerName: string;
      customerPhone: string;
      pincode: string;
      customerType?: string;
      productCategory: string;
      leadNumber: string;
    }
  ): Promise<void> {
    const effectiveRep = rep || SalesRepDirectory.getFallbackRep();
    const cleanRepPhone = (effectiveRep.mobile || "+91 93151 60881").replace(/\D/g, "");
    const customerPhone = leadDetails.customerPhone.replace(/\D/g, "");

    const alertToRep =
      `🚨 *नई डीलर लीड अलर्ट! (New WhatsApp Lead)*\n\n` +
      `नमस्ते *${effectiveRep.name} ji*,\n` +
      `आपके क्षेत्र (*${effectiveRep.area}*) से एक नई लीड दर्ज हुई है:\n\n` +
      `👤 *ग्राहक/फर्म:* ${leadDetails.customerName}\n` +
      `📞 *मोबाइल:* +${customerPhone}\n` +
      `📍 *पिन कोड:* ${leadDetails.pincode} (${effectiveRep.state})\n` +
      `🏷️ *प्रकार:* ${leadDetails.customerType || "Dealer"}\n` +
      `📦 *उत्पाद श्रेणी:* ${leadDetails.productCategory}\n` +
      `🆔 *लीड आईडी:* ${leadDetails.leadNumber}\n\n` +
      `⚡ कृपया तुरंत ग्राहक से संपर्क करके आवश्यक डील क्लोज करें!`;

    // 1. Direct dispatch via Evolution API (Bypasses queue delays for instant delivery)
    if (cleanRepPhone && cleanRepPhone !== customerPhone) {
      try {
        console.log(`📲 [RepAlert] Dispatching WhatsApp alert to Rep ${rep.name} (+${cleanRepPhone})...`);
        const result = await evolutionClient.sendTextMessage({
          number: cleanRepPhone,
          text: alertToRep,
        });

        if (result.success) {
          console.log(`✅ [RepAlert] Successfully delivered lead alert to Rep ${rep.name} (+${cleanRepPhone}). MsgId: ${result.messageId}`);
        } else {
          console.warn(`⚠️ [RepAlert] Evolution API alert warning to ${cleanRepPhone}: ${result.error}`);
        }

        // Save into MongoDB Message collection so rep's inbox log is updated
        try {
          const Message = getMessageModel();
          await Message.create({
            phone: `+${cleanRepPhone}`,
            sender: "bot",
            content: alertToRep,
            mediaType: "text",
          });
        } catch (mErr: any) {
          // ignore DB notice
        }
      } catch (err: any) {
        console.error(`❌ [RepAlert] Failed direct dispatch to ${cleanRepPhone}: ${err.message}`);
      }
    }

    // 2. Also send to Central Admin phone if configured via environment
    const centralAdminPhone = (process.env.ADMIN_WHATSAPP_PHONE || "").replace(/\D/g, "");
    if (centralAdminPhone && centralAdminPhone !== cleanRepPhone && centralAdminPhone !== customerPhone) {
      try {
        await evolutionClient.sendTextMessage({
          number: centralAdminPhone,
          text: `🔔 *[ADMIN COPY] New Inbound Lead Assigned to ${rep.name}:*\n\n${alertToRep}`,
        });
        console.log(`✅ [RepAlert] Delivered Admin copy to +${centralAdminPhone}`);
      } catch (adminErr: any) {
        console.warn(`[RepAlert] Admin copy warning: ${adminErr.message}`);
      }
    }
  }

  /**
   * Main entry point for customer WhatsApp messages
   */
  static async processMessage(phone: string, text: string, customerName?: string): Promise<FlowResponse> {
    const cleanText = text.trim();
    const lower = cleanText.toLowerCase();

    // 1. Spam & OTP Filter
    if (this.isSpamOrFiltered(cleanText, phone)) {
      return { replyText: "", ignoreMessage: true };
    }

    // 2. Fetch or initialize conversation state
    const ConversationState = getConversationStateModel();
    let stateDoc = await ConversationState.findOne({ phone });

    if (!stateDoc) {
      stateDoc = new ConversationState({
        phone,
        state: "LANGUAGE_SELECTION",
        language: "en",
        formData: {},
        lastMessageTimestamp: Date.now(),
      });
    }

    // 3. Inactivity Auto-Reset (if user returns after 2+ hours, start fresh)
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    if (stateDoc.lastMessageTimestamp && (now - stateDoc.lastMessageTimestamp > TWO_HOURS_MS) && stateDoc.state !== "LANGUAGE_SELECTION") {
      console.log(`⏱️ [FlowEngine] Session for ${phone} expired after 2h idle. Resetting to LANGUAGE_SELECTION.`);
      stateDoc.state = "LANGUAGE_SELECTION";
      stateDoc.formData = {};
    }

    // 3b. Loop Guard Rate Limiter (20 msgs in 30s)
    if (now - stateDoc.windowStartTimestamp > 30000) {
      stateDoc.windowStartTimestamp = now;
      stateDoc.messageCountWindow = 1;
    } else {
      stateDoc.messageCountWindow += 1;
      if (stateDoc.messageCountWindow > 20) {
        console.warn(`⚠️ [FlowEngine] Loop guard triggered for ${phone}. Rate limiting for 15s.`);
        await stateDoc.save();
        return { replyText: "", ignoreMessage: true };
      }
    }

    stateDoc.lastMessageTimestamp = now;

    // 4. Voice Note & Image Handlers (Never leave multimedia unhandled)
    if (cleanText === "[Voice Note]") {
      const isHi = stateDoc.language === "hi";
      return {
        replyText: isHi
          ? `🎙️ *नमस्ते!* हमने आपका वॉइस नोट प्राप्त कर लिया है।\n\nहमारी टीम इसे जल्द ही सुनेगी। यदि आपको तत्काल उत्पाद कैटलॉग या एरिया सेल्स मैनेजर से बात करनी है, तो कृपया नीचे दिए गए विकल्पों में से चुनें:\n\n1. 📄 Product Catalogues\n2. 💰 Pricing & Sales Team\n3. 📝 Submit Requirement\n4. 🏠 Main Menu`
          : `🎙️ *Hello!* We have received your voice note.\n\nOur team will review it shortly. If you need immediate assistance, please choose from the options below:\n\n1. 📄 Product Catalogues\n2. 💰 Pricing & Sales Team\n3. 📝 Submit Requirement\n4. 🏠 Main Menu`,
      };
    }

    if (cleanText === "[Image]") {
      const isHi = stateDoc.language === "hi";
      return {
        replyText: isHi
          ? `📸 *फोटो प्राप्त हुई!* RN Valves को इमेज भेजने के लिए धन्यवाद।\n\nयदि आप इस उत्पाद का कैटलॉग या रेट जानना चाहते हैं, तो कृपया उत्पाद का *आइटम कोड* लिखें या एरिया सेल्स मैनेजर से कनेक्ट होने के लिए अपना *पिन कोड* भेजें।\n\nमेन्यू देखने के लिए *Menu* लिखें।`
          : `📸 *Photo Received!* Thank you for sharing the image with RN Valves.\n\nTo check prices or availability, please type the *Item Code* or share your *Area PIN Code* to connect with your Regional Sales Manager.\n\nType *Menu* for the main menu.`,
      };
    }

    // 4b. Customer Care, Complaints & Helpline Intent
    const isCareOrComplaint = /\b(call me|call karo|phone karo|contact number|customer care|helpline|human|agent|executive|insaan se baat|baat karni hai|complaint|shikayat|problem|kharab|service|warranty|defect|damage|toll free|tollfree|email|1800|9891201208)\b/i.test(cleanText);
    if (isCareOrComplaint) {
      return this.renderCustomerCareCard(stateDoc.language);
    }

    // 4c. Global Shortcuts (Hi / Reset, Main Menu, Change Language, Back)
    const isReset = /\b(hi|hello|hey|namaste|namaskar|pranam|start|restart|reset|hlo|hii|helo)\b/i.test(cleanText) &&
      cleanText.split(/\s+/).length <= 4;

    if (isReset && stateDoc.state !== "LANGUAGE_SELECTION") {
      stateDoc.state = "LANGUAGE_SELECTION";
      stateDoc.formData = {};
      await stateDoc.save();
      return this.renderLanguageSelection();
    }

    if (lower === "main menu" || lower === "menu" || lower === "home") {
      stateDoc.state = "BUSINESS_MENU";
      await stateDoc.save();
      return this.renderBusinessMenu(stateDoc.language, stateDoc.customerType || "Dealer");
    }

    if (/^(back|cancel|exit|wapas|peeche)$/i.test(cleanText)) {
      stateDoc.state = "BUSINESS_MENU";
      await stateDoc.save();
      return this.renderBusinessMenu(stateDoc.language, stateDoc.customerType || "Dealer");
    }

    if (lower === "change language" || lower === "bhasha badle" || lower === "language") {
      stateDoc.state = "LANGUAGE_SELECTION";
      await stateDoc.save();
      return this.renderLanguageSelection();
    }

    // 5. Strict Product SKU Lookup (Only if explicit item code e.g. "RNALP28G15" or "RN-102" is provided)
    const { skuCode } = ProductRepository.extractSearchTerms(cleanText);
    const isStrictSku = skuCode && /^[a-z0-9\-]{4,15}$/i.test(skuCode) && /\d/.test(skuCode) && !/^(1|2|3|4|5|6|7|8)$/.test(cleanText);
    if (isStrictSku) {
      const searchResults = await ProductRepository.searchProducts(cleanText, 1);
      if (searchResults && searchResults.length > 0) {
        const top = searchResults[0];
        const price = top.inSelling || top.inMrp || top.price || 0;
        const mrp = top.inMrp || top.price || 0;
        const lang = stateDoc.language;

        let card = "";
        if (lang === "hi") {
          card = `Namaste! Yeh lijiye *${top.name}* ki verified details:\n\n`;
          card += `🔖 *Item Code:* ${top.code}\n`;
          if (price > 0) card += `💰 *Approved Price:* ₹${price}/- (MRP: ₹${mrp}/-)\n`;
          card += `📦 *Stock Status:* ${top.stockStatus}\n`;
          if (top.residentialWarranty) card += `🛡️ *Warranty:* ${top.residentialWarranty} Saal\n`;
          card += `\nAage kya karna chahenge?\n1. 👤 Regional Sales Manager se baat karein\n2. 📄 Product Catalogue dekhein\n3. 🏠 Main Menu`;
        } else {
          card = `Hello! Here are the verified details for *${top.name}*:\n\n`;
          card += `🔖 *Item Code:* ${top.code}\n`;
          if (price > 0) card += `💰 *Approved Price:* ₹${price}/- (MRP: ₹${mrp}/-)\n`;
          card += `📦 *Stock Status:* ${top.stockStatus}\n`;
          if (top.residentialWarranty) card += `🛡️ *Warranty:* ${top.residentialWarranty} Years\n`;
          card += `\nHow would you like to proceed?\n1. 👤 Talk to Regional Sales Team\n2. 📄 View Product Catalogues\n3. 🏠 Main Menu`;
        }

        // Keep state open to post actions
        stateDoc.state = "POST_CATALOGUE";
        stateDoc.formData.interestedCategory = top.category || top.name;
        await stateDoc.save();

        return {
          replyText: card,
          mediaUrl: top.image ? (top.image.startsWith("http") ? top.image : `https://rnvalves.media/${top.image.replace(/^\//, "")}`) : undefined,
          mediaType: top.image ? "image" : undefined,
          mediaCaption: `*${top.name}* (Code: ${top.code})`,
        };
      }
    }

    // 5b. Smart Auto-Extraction for Pasted Business Card / Dealer Details
    const hasShop = /shop|firm|dukan|store|enterprise|trading/i.test(cleanText);
    const hasPin = /pincode|pin\s*code|pin\s*:\s*\d{6}|\b\d{6}\b/i.test(cleanText);
    const hasPerson = /contact\s*person|name|person|sumit|aditya/i.test(cleanText);
    const hasPhone = /calling\s*number|mobile|phone|contact\s*number|\b[6-9]\d{9}\b/i.test(cleanText);

    if ((hasShop || hasPerson) && (hasPin || hasPhone)) {
      const pinMatch = cleanText.match(/\b([1-9][0-9]{5})\b/);
      const phoneMatch = cleanText.match(/\b([6-9][0-9]{9,11})\b/);

      const pin = pinMatch ? pinMatch[1] : (stateDoc.formData.pincode || "");
      let mob = phoneMatch ? phoneMatch[1].slice(-10) : phone;

      let shopName = "";
      const shopLine = cleanText.match(/(?:shop\s*name|firm|dukan|store)[:\s\-*]+([^\n\r]+)/i);
      if (shopLine) shopName = shopLine[1].replace(/[*_~`]/g, "").trim();

      let personName = "";
      const personLine = cleanText.match(/(?:contact\s*person|person\s*name|name)[:\s\-*]+([^\n\r]+)/i);
      if (personLine) personName = personLine[1].replace(/[*_~`]/g, "").trim();

      const finalName = personName || shopName || customerName || "Customer";
      const rep = pin ? SalesRepDirectory.getRepByPin(pin) : SalesRepDirectory.getFallbackRep();
      const leadNumber = `RNL-${Math.floor(10000 + Math.random() * 90000)}`;

      const Lead = getLeadModel();
      try {
        await Lead.create({
          leadNumber,
          customerName: finalName,
          phone: mob,
          businessType: stateDoc.customerType || "Dealer",
          city: rep.state,
          state: rep.state,
          productCategory: "All Categories",
          productInterest: ["All Categories"],
          requirementDescription: `WhatsApp Lead (Auto-extracted):\n${cleanText}`,
          leadSource: "WhatsApp_Inbound",
          assignedEmployeeName: rep.name,
          status: "NEW",
          priority: "HIGH",
          internalNotes: [`Auto-extracted lead assigned to ${rep.name} (${rep.mobile}) for ${rep.state} region via WhatsApp Bot`],
        });
        console.log(`✅ [FlowEngine] Extracted & Created Lead ${leadNumber} for ${finalName} -> Assigned to ${rep.name}`);
      } catch (err: any) {
        console.error(`❌ [FlowEngine] Failed to save lead: ${err.message}`);
      }

      // Send instant WhatsApp alert directly to the Regional Sales Rep & Admin
      try {
        await FlowEngine.dispatchRepWhatsAppAlert(rep, {
          customerName: finalName,
          customerPhone: mob,
          pincode: pin,
          customerType: stateDoc.customerType || "Dealer",
          productCategory: "All Categories",
          leadNumber,
        });
      } catch (alertErr: any) {
        console.warn(`[FlowEngine] Rep notification skipped: ${alertErr.message}`);
      }

      stateDoc.state = "COMPLETED";
      stateDoc.formData = {
        name: finalName,
        mobile: mob,
        pincode: pin,
        interestedCategory: "All Categories",
        assignedAgent: rep,
      };
      await stateDoc.save();

      const isHi = stateDoc.language === "hi";
      let msg = isHi
        ? `🎉 *धन्यवाद ${finalName}!* आपके व्यापार विवरण सफलतापूर्वक दर्ज कर लिए गए हैं।\n\n`
        : `🎉 *Thank you ${finalName}!* Your business details have been registered successfully.\n\n`;

      msg += `📋 *विवरण:*\n• नाम: ${finalName}\n• मोबाइल: ${mob}\n• पिन कोड: ${pin}\n\n`;
      msg += `👤 *आपके क्षेत्रीय बिक्री प्रबंधक (Regional Sales Manager):*\n`;
      msg += `• नाम: *${rep.name}*\n• संपर्क: *${rep.mobile}*\n• क्षेत्र: ${rep.area} (${rep.state})\n\n`;
      msg += isHi
        ? `हमारे सेल्स मैनेजर शीघ्र ही आपसे विशेष डीलर प्राइज लिस्ट के साथ संपर्क करेंगे।\n\n1. 🏠 Main Menu`
        : `Our Sales Manager will contact you shortly with the exclusive dealer price list.\n\n1. 🏠 Main Menu`;

      return {
        replyText: msg,
        mediaUrl: "https://rnvalves.com/uploads/aboutus/rn-catalogue-price-list-compressedpdf5kvoaov0mh23c3e2iedvrd0qhliikm.pdf",
        mediaType: "document",
        mediaFileName: "RN_Valves_Complete_Catalogue_PriceList.pdf",
        mediaCaption: "RN Valves & Faucets - Complete Product Catalogue & Price List",
      };
    }

    // 6. Execute State Machine Step
    const response = await this.handleStateTransition(stateDoc, cleanText, lower, customerName);
    await stateDoc.save();
    return response;
  }

  /**
   * State Machine Transitions
   */
  private static async handleStateTransition(
    session: IConversationState,
    text: string,
    lower: string,
    customerName?: string
  ): Promise<FlowResponse> {
    const currentState = session.state;

    // Advanced input normalization: emojis, numerals, leading digits, strip punctuation
    const norm = lower
      .replace(/1️⃣|¹/g, "1")
      .replace(/2️⃣|²/g, "2")
      .replace(/3️⃣|³/g, "3")
      .replace(/4️⃣/g, "4")
      .replace(/5️⃣/g, "5")
      .replace(/6️⃣/g, "6")
      .replace(/7️⃣/g, "7")
      .replace(/8️⃣/g, "8")
      .trim();

    // Match leading single digit option (e.g. "1.", "1)", "1 - dealer", "1 dealer", "#1")
    const numMatch = norm.match(/^(?:#|\b)?([1-8])(?:[.)\s\-:]+.*)?$/);
    const leadingDigit = numMatch ? numMatch[1] : null;
    const cleanChoice = leadingDigit || norm;

    switch (currentState) {
      // ----------------------------------------------------
      // STATE 1: LANGUAGE SELECTION
      // ----------------------------------------------------
      case "START":
      case "LANGUAGE_SELECTION": {
        const langMap: Record<string, "en" | "hi" | "te" | "ta" | "pa" | "ur"> = {
          "1": "en",
          english: "en",
          "2": "hi",
          hindi: "hi",
          "हिंदी": "hi",
          "3": "te",
          telugu: "te",
          "4": "ta",
          tamil: "ta",
          "5": "pa",
          punjabi: "pa",
          "6": "ur",
          urdu: "ur",
        };

        const chosenLang = langMap[cleanChoice] || langMap[leadingDigit || ""] || (/2|hindi/i.test(norm) ? "hi" : /1|english/i.test(norm) ? "en" : null);

        if (!chosenLang) {
          if (norm.length > 2 && !/^[1-6]$/.test(cleanChoice)) {
            session.state = "HUMAN_TAKEOVER_PROMPT";
            return this.renderHumanTakeoverPrompt(session.language);
          }
          return this.renderLanguageSelection("Please select a valid option (1-6).");
        }

        session.language = chosenLang;
        session.state = "REQUIREMENT_TYPE";
        return this.renderRequirementType(session.language);
      }

      // ----------------------------------------------------
      // STATE 2: REQUIREMENT TYPE
      // ----------------------------------------------------
      case "REQUIREMENT_TYPE": {
        if (cleanChoice === "6" || norm.includes("bhasha") || norm.includes("language")) {
          session.state = "LANGUAGE_SELECTION";
          return this.renderLanguageSelection();
        }

        if (
          cleanChoice === "5" ||
          norm.includes("website") ||
          norm.includes("order") ||
          norm.includes("online") ||
          norm.includes("ecommerce") ||
          norm.includes("e-commerce")
        ) {
          session.customerType = "Website Order";
          session.state = "WEBSITE_ORDER_ENQUIRY";
          return this.renderWebsiteOrderSupport(session.language);
        }

        if (cleanChoice === "4" || norm.includes("personal") || norm.includes("ghar") || norm.includes("home") || norm.includes("khud")) {
          session.customerType = "Personal Use";
          session.state = "PERSONAL_USE_END";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `चूँकि आप व्यक्तिगत उपयोग (Personal Use) के लिए उत्पाद ढूंढ रहे हैं, आप हमारी आधिकारिक वेबसाइट से सीधे उत्पाद देख और खरीद सकते हैं।\n\n🌐 *वेबसाइट:* https://rnvalves.com\n\nमुख्य मेन्यू पर वापस जाने के लिए कभी भी *Main Menu* या *Hi* लिखें।`
              : `Since you are looking for products for personal use, you can explore and purchase directly from our official website.\n\n🌐 *Visit Website:* https://rnvalves.com\n\nTo return to the main menu anytime, type *Main Menu* or *Hi*.`,
          };
        }

        let custType: "Distributor" | "Dealer" | "Retailer" | null = null;
        if (cleanChoice === "1" || /distribut/i.test(norm) || /stockist/i.test(norm) || /wholesale/i.test(norm)) custType = "Distributor";
        else if (cleanChoice === "2" || /dealer/i.test(norm) || /dukan|shop|store|sanitary/i.test(norm)) custType = "Dealer";
        else if (cleanChoice === "3" || /retail/i.test(norm) || /plumber/i.test(norm)) custType = "Retailer";

        if (!custType) {
          session.state = "HUMAN_TAKEOVER_PROMPT";
          return this.renderHumanTakeoverPrompt(session.language);
        }

        session.customerType = custType;
        session.state = "FORM_NAME";
        session.formData = {
          mobile: session.phone.replace(/\D/g, "").slice(-10),
        };

        const lang = session.language;
        let welcomePrompt = "";
        if (lang === "pa") {
          welcomePrompt = `🤝 *ਧੰਨਵਾਦ! RN Valves ${custType} ਨੈੱਟਵਰਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ।*\n\nਆਪਣੇ ਖੇਤਰੀ ਸੇਲਜ਼ ਮੈਨੇਜਰ ਨਾਲ ਜੁੜਨ ਅਤੇ ਵਿਸ਼ੇਸ਼ ${custType} ਰੇਟ ਲਿਸਟ ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ, ਕਿਰਪਾ ਕਰਕੇ ਕੁਝ ਵੇਰਵੇ ਸਾਂਝੇ ਕਰੋ:\n\n📝 *ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਜਾਂ ਦੁਕਾਨ/ਫ਼ਰਮ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ:*\n(ਉਦਾਹਰਣ: Sharma Sanitary Store ਜਾਂ Rahul Gupta)`;
        } else if (lang === "te") {
          welcomePrompt = `🤝 *ధన్యవాదాలు! RN Valves ${custType} నెట్‌వర్క్‌కి స్వాగతం.*\n\nమీ ప్రాంతీయ సేల్స్ మేనేజర్‌తో కనెక్ట్ కావడానికి మరియు ప్రత్యేక ${custType} ధరల జాబితా కోసం:\n\n📝 *దయచేసి మీ పూర్తి పేరు లేదా షాప్/ఫర్మ్ పేరు నమోదు చేయండి:*\n(ఉదాహరణ: Sharma Sanitary Store లేదా Rahul Gupta)`;
        } else if (lang === "ta") {
          welcomePrompt = `🤝 *நன்றி! RN Valves ${custType} நெட்வொர்க்கிற்கு வரவேற்கிறோம்.*\n\nஉங்கள் பிராந்திய விற்பனை மேலாளருடன் இணைவதற்கும் பிரத்யேக ${custType} விலை பட்டியலுக்கும்:\n\n📝 *தயவுசெய்து உங்கள் முழு பெயர் அல்லது கடையின் பெயரை உள்ளிடவும்:*\n(எடுத்துக்காட்டு: Sharma Sanitary Store அல்லது Rahul Gupta)`;
        } else if (lang === "ur") {
          welcomePrompt = `🤝 *شکریہ! RN Valves ${custType} نیٹ ورک میں خوش آمدید۔*\n\nاپنے علاقائی سیلز مینیجر سے رابطہ قائم کرنے اور خصوصی قیمتوں کے لیے:\n\n📝 *براہ کرم اپنا پورا نام یا دکان/فرم کا نام درج کریں:*\n(مثال: Sharma Sanitary Store یا Rahul Gupta)`;
        } else if (lang === "hi") {
          welcomePrompt = `🤝 *धन्यवाद! RN Valves ${custType} नेटवर्क में आपका स्वागत है।* 🙏\n\nआपके क्षेत्र के अधिकृत रीजनल सेल्स मैनेजर से जोड़ने और विशेष ${custType} प्राइज लिस्ट / कैटलॉग प्रदान करने के लिए, कृपया कुछ विवरण साझा करें:\n\n📝 *कृपया अपना पूरा नाम या दुकान/फर्म का नाम लिखें:*\n(उदाहरण: Sharma Sanitary Store या Rahul Gupta)`;
        } else {
          welcomePrompt = `🤝 *Thank you! Welcome to the RN Valves ${custType} Network.* 🙏\n\nTo connect you directly with your Regional Sales Manager and share exclusive wholesale ${custType} pricing & catalogues, please share a few quick details:\n\n📝 *Please enter your Full Name or Firm/Shop Name:*\n(Example: Sharma Sanitary Store or Rahul Gupta)`;
        }

        return { replyText: welcomePrompt };
      }

      // ----------------------------------------------------
      // STATE 2b: PERSONAL USE END
      // ----------------------------------------------------
      case "PERSONAL_USE_END": {
        if (lower === "1" || lower.includes("main menu") || lower.includes("menu")) {
          session.state = "REQUIREMENT_TYPE";
          return this.renderRequirementType(session.language);
        }
        return { replyText: "", ignoreMessage: true };
      }

      // ----------------------------------------------------
      // STATE 2c: WEBSITE ORDER ENQUIRY
      // ----------------------------------------------------
      case "WEBSITE_ORDER_ENQUIRY": {
        if (lower === "1" || lower === "menu" || lower.includes("main menu") || lower === "hi") {
          session.state = "REQUIREMENT_TYPE";
          return this.renderRequirementType(session.language);
        }

        const isHi = session.language === "hi";
        const cleanCustPhone = (session.formData.mobile || session.phone).replace(/\D/g, "");

        // Dispatch instant alert to E-Commerce Executive (+91 93156 03920)
        try {
          const ecommAlert =
            `📦 *नया वेबसाइट ऑर्डर सहायता अलर्ट! (Website Order Enquiry)*\n\n` +
            `नमस्ते,\n` +
            `एक ग्राहक ने rnvalves.com ऑनलाइन ऑर्डर के संबंध में सहायता मांगी है:\n\n` +
            `📞 *ग्राहक मोबाइल:* +${cleanCustPhone}\n` +
            `📝 *संदेश / Order ID:* ${text.trim()}\n` +
            `⏰ *समय:* ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}\n\n` +
            `⚡ कृपया तुरंत ग्राहक से संपर्क करके सहायता प्रदान करें!`;

          evolutionClient.sendTextMessage({
            number: "919315603920",
            text: ecommAlert,
          }).catch((err: any) => console.warn(`[EcommAlert] WhatsApp dispatch notice: ${err.message}`));
        } catch (e: any) {}

        session.state = "COMPLETED";

        return {
          replyText: isHi
            ? `✅ *धन्यवाद!* आपका संदेश हमारे ई-कॉमर्स एग्जीक्यूटिव (*+91 93156 03920*) को भेज दिया गया है।\n\nवे आपके ऑर्डर की स्थिति जाँचकर अतिशीघ्र आपसे संपर्क करेंगे।\n\n🌐 *आधिकारिक स्टोर:* https://rnvalves.com\n\n1. 🏠 Main Menu`
            : `✅ *Thank you!* Your message has been forwarded directly to our E-Commerce Executive (*+91 93156 03920*).\n\nOur team will review your order status and connect with you shortly.\n\n🌐 *Official Store:* https://rnvalves.com\n\n1. 🏠 Main Menu`,
        };
      }

      // ----------------------------------------------------
      // STATE 3: BUSINESS MENU
      // ----------------------------------------------------
      case "BUSINESS_MENU": {
        if (cleanChoice === "1" || norm.includes("catalog")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (cleanChoice === "2" || norm.includes("pricing") || norm.includes("enquiry") || norm.includes("rate") || norm.includes("sales")) {
          const isHi = session.language === "hi";
          session.state = "SALES_PIN_CODE";
          return {
            replyText: isHi
              ? `🔍 *मूल्य व उत्पाद पूछताछ (Pricing & Product Search)*\n\n` +
                `1️⃣ *किसी ख़ास उत्पाद का रेट व फोटो देखना हो:*\n` +
                `👉 सीधे उत्पाद का *Item Code / SKU* (जैसे: *RNALP28G15* या *RN-102*) या नाम (जैसे: *Amara angle cock*) लिखकर भेजें!\n\n` +
                `2️⃣ *थोक डीलर रेट्स व सेल्स टीम से बात करनी हो:*\n` +
                `👉 अपने क्षेत्र का *6-अंकीय एरिया पिन कोड* (जैसे: *110001*) भेजें।\n\n` +
                `(वापस जाने के लिए *Menu* लिखें)`
              : `🔍 *Pricing & Product Search*\n\n` +
                `1️⃣ *To view instant price, specs & photo of any product:*\n` +
                `👉 Simply send the *Item Code / SKU* (e.g. *RNALP28G15* or *RN-102*) or name (e.g. *Amara angle cock*)!\n\n` +
                `2️⃣ *For wholesale dealer pricing & sales manager connection:*\n` +
                `👉 Send your *6-digit Area PIN Code* (e.g. *110001*).\n\n` +
                `(Type *Menu* to go back)`,
          };
        }

        if (cleanChoice === "3" || norm.includes("submit") || norm.includes("requirement")) {
          session.state = "FORM_NAME";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना पूरा नाम या दुकान/फर्म का नाम दर्ज करें:\n(उदाहरण: Sharma Sanitary Store या Rahul Gupta)`
              : `Please enter your Full Name or Firm/Shop Name:\n(Example: Sharma Sanitary Store or Rahul Gupta)`,
          };
        }

        if (cleanChoice === "4" || norm.includes("care") || norm.includes("complaint") || norm.includes("support") || norm.includes("shikayat") || norm.includes("service")) {
          return this.renderCustomerCareCard(session.language);
        }

        if (cleanChoice === "5" || norm.includes("main menu") || norm.includes("menu")) {
          session.state = "REQUIREMENT_TYPE";
          return this.renderRequirementType(session.language);
        }

        session.state = "HUMAN_TAKEOVER_PROMPT";
        return this.renderHumanTakeoverPrompt(session.language);
      }

      // ----------------------------------------------------
      // STATE 4: PRODUCT CATALOGUES
      // ----------------------------------------------------
      case "PRODUCT_CATALOGUES": {
        if (cleanChoice === "8" || norm.includes("main menu") || norm.includes("menu")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        const category = CatalogueDirectory.getCategory(cleanChoice);
        if (!category) {
          session.state = "HUMAN_TAKEOVER_PROMPT";
          return this.renderHumanTakeoverPrompt(session.language);
        }

        session.state = "POST_CATALOGUE";
        session.formData.interestedCategory = category.name;
        const isHi = session.language === "hi";

        const textResponse = isHi
          ? `📄 *${category.name}* का कैटलॉग पीडीएफ:\n${category.pdfUrl}\n\nआप आगे क्या करना चाहेंगे?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`
          : `📄 Here is the official *${category.name}* Catalogue PDF:\n${category.pdfUrl}\n\nHow would you like to proceed?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;

        return {
          replyText: textResponse,
          mediaUrl: category.pdfUrl,
          mediaType: "document",
          mediaFileName: `RN_Valves_${category.id}.pdf`,
          mediaCaption: `RN Valves & Faucets - ${category.name} Catalogue`,
        };
      }

      // ----------------------------------------------------
      // STATE 5: POST CATALOGUE OPTIONS
      // ----------------------------------------------------
      case "POST_CATALOGUE": {
        if (cleanChoice === "1" || norm.includes("sales")) {
          session.state = "SALES_PIN_CODE";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपने क्षेत्र का 6-अंकीय एरिया पिन कोड (Area PIN Code) दर्ज करें:`
              : `Please enter your 6-digit Area PIN Code:`,
          };
        }

        if (cleanChoice === "2" || norm.includes("submit")) {
          session.state = "FORM_NAME";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना पूरा नाम दर्ज करें:`
              : `Please enter your Full Name:`,
          };
        }

        if (cleanChoice === "3" || norm.includes("other") || norm.includes("category")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (cleanChoice === "4" || norm.includes("main menu") || norm.includes("menu")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        session.state = "HUMAN_TAKEOVER_PROMPT";
        return this.renderHumanTakeoverPrompt(session.language);
      }

      // ----------------------------------------------------
      // STATE 6: SALES PIN CODE
      // ----------------------------------------------------
      case "SALES_PIN_CODE": {
        if (/^(back|cancel|exit|menu)$/i.test(text.trim())) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        const pinMatch = text.match(/\b([1-9][0-9]{5})\b/);
        const cleanPin = pinMatch ? pinMatch[1] : text.replace(/\D/g, "");

        if (cleanPin.length !== 6) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `⚠️ कृपया 6 अंकों का मान्य भारतीय पिन कोड दर्ज करें। उदाहरण: 110001\n(मेन्यू पर वापस जाने के लिए *Menu* लिखें)`
              : `⚠️ Please enter a valid 6-digit Indian PIN Code. Example: 110001\n(Type *Menu* to return to main menu)`,
          };
        }

        session.formData.pincode = cleanPin;
        const rep = SalesRepDirectory.getRepByPin(cleanPin);
        session.formData.assignedAgent = rep;
        session.state = "SALES_REP_SHOWN";

        // Notify sales manager immediately of the customer looking for regional contact
        try {
          const cleanRepPhone = rep.mobile.replace(/\D/g, "");
          const custPhone = (session.formData.mobile || session.phone).replace(/\D/g, "");
          if (cleanRepPhone && cleanRepPhone !== custPhone) {
            evolutionClient.sendTextMessage({
              number: cleanRepPhone,
              text: `ℹ️ *ग्राहक संपर्क अलर्ट!*\n\nनमस्ते *${rep.name} ji*,\nपिन कोड *${cleanPin}* (${rep.state}) से ग्राहक (+${custPhone}) ने अभी आपकी टीम से संपर्क करने के लिए संपर्क विवरण देखा है।`,
            }).catch((e: any) => console.warn(`[RepPinAlert] warning: ${e.message}`));
          }
        } catch (e: any) {}

        return this.renderSalesRepCard(session.language, rep, cleanPin);
      }

      // ----------------------------------------------------
      // STATE 7: SALES REP SHOWN
      // ----------------------------------------------------
      case "SALES_REP_SHOWN": {
        if (cleanChoice === "1" || norm.includes("submit") || norm.includes("requirement")) {
          session.state = "FORM_NAME";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना पूरा नाम या दुकान/फर्म का नाम दर्ज करें:\n(उदाहरण: Aditya Enterprises या Sumit Kumar)`
              : `Please enter your Full Name or Firm/Shop Name:\n(Example: Aditya Enterprises or Sumit Kumar)`,
          };
        }

        if (cleanChoice === "2" || norm.includes("catalog") || norm.includes("other") || norm.includes("category")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (cleanChoice === "3" || norm.includes("care") || norm.includes("complaint") || norm.includes("support") || norm.includes("service")) {
          return this.renderCustomerCareCard(session.language);
        }

        if (cleanChoice === "4" || norm.includes("main menu") || norm.includes("menu") || norm.includes("home")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        session.state = "HUMAN_TAKEOVER_PROMPT";
        return this.renderHumanTakeoverPrompt(session.language);
      }

      // ----------------------------------------------------
      // STATE 8: FORM - NAME
      // ----------------------------------------------------
      case "FORM_NAME": {
        if (/^(back|cancel|exit|menu)$/i.test(text.trim())) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        const cleanName = text.trim();
        // Validation: Must not be purely digits, at least 2 characters, and not off-topic questions
        if (cleanName.length < 2 || /^\d+$/.test(cleanName) || /[@$%^*_+=\[\]{}|\\<>~`]/g.test(cleanName) || /\b(kaun|kyu|kyun|discount|price|rate|kya|who|why|help|agent|human|talk|baat)\b/i.test(cleanName)) {
          session.state = "HUMAN_TAKEOVER_PROMPT";
          return this.renderHumanTakeoverPrompt(session.language);
        }

        session.formData.name = cleanName;
        // Check if an explicit mobile number was included
        const phoneMatch = cleanName.match(/\b([6-9]\d{9})\b/);
        if (phoneMatch) {
          session.formData.mobile = phoneMatch[1];
        } else if (!session.formData.mobile) {
          session.formData.mobile = session.phone.replace(/\D/g, "").slice(-10);
        }

        session.state = "FORM_PIN";
        const lang = session.language;
        let pinPrompt = "";
        if (lang === "pa") {
          pinPrompt = `ਧੰਨਵਾਦ *${cleanName}* ਜੀ! 🙏\n\n📍 *ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਖੇਤਰ ਦਾ 6-ਅੰਕੀ ਪਿਨ ਕੋਡ (Area PIN Code) ਦਰਜ ਕਰੋ:*\n(ਉਦਾਹਰਣ: 110001 ਜਾਂ 141001)`;
        } else if (lang === "te") {
          pinPrompt = `ధన్యవాదాలు *${cleanName}* గారు! 🙏\n\n📍 *దయచేసి మీ ప్రాంతం యొక్క 6-అంకెల పిన్ కోడ్ (Area PIN Code) నమోదు చేయండి:*\n(ఉదాహరణ: 500001)`;
        } else if (lang === "ta") {
          pinPrompt = `நன்றி *${cleanName}*! 🙏\n\n📍 *தயவுசெய்து உங்கள் 6-இலக்க பகுதி பின் குறியீட்டை (Area PIN Code) உள்ளிடவும்:*\n(எடுத்துக்காட்டு: 600001)`;
        } else if (lang === "ur") {
          pinPrompt = `شکریہ *${cleanName}* صاحب! 🙏\n\n📍 *براہ کرم اپنے علاقے کا 6 ہندسوں کا پن کوڈ درج کریں:*\n(مثال: 110001)`;
        } else if (lang === "hi") {
          pinPrompt = `धन्यवाद *${cleanName}* जी! 🙏\n\n📍 *कृपया अपनी दुकान/फर्म का 6-अंकीय एरिया पिन कोड (Area PIN Code) दर्ज करें:*\n(उदाहरण: 110001 या 274301)`;
        } else {
          pinPrompt = `Thank you *${cleanName}*! 🙏\n\n📍 *Please enter your 6-digit Area PIN Code:*\n(Example: 110001 or 274301)`;
        }

        return { replyText: pinPrompt };
      }

      // ----------------------------------------------------
      // STATE 9: FORM - MOBILE
      // ----------------------------------------------------
      case "FORM_MOBILE": {
        if (/^(back|cancel|exit|menu)$/i.test(text.trim())) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        let cleanMobile = text.replace(/\D/g, "");
        if (cleanMobile.length === 12 && cleanMobile.startsWith("91")) {
          cleanMobile = cleanMobile.slice(2);
        } else if (cleanMobile.length === 11 && cleanMobile.startsWith("0")) {
          cleanMobile = cleanMobile.slice(1);
        }

        if (cleanMobile.length !== 10 || !/^[6-9]\d{9}$/.test(cleanMobile)) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `⚠️ कृपया 10 अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें (6, 7, 8 या 9 से शुरू होने वाला)।\nउदाहरण: 9876543210`
              : `⚠️ Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9).\nExample: 9876543210`,
          };
        }

        session.formData.mobile = cleanMobile;
        session.state = "FORM_PIN";
        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `कृपया अपने क्षेत्र का 6-अंकीय पिन कोड (Area PIN Code) दर्ज करें:`
            : `Please enter your 6-digit Area PIN Code:`,
        };
      }

      // ----------------------------------------------------
      // STATE 10: FORM - PIN CODE
      // ----------------------------------------------------
      case "FORM_PIN": {
        if (/^(back|cancel|exit|menu)$/i.test(text.trim())) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        const pinMatch = text.match(/\b([1-9][0-9]{5})\b/);
        const cleanPin = pinMatch ? pinMatch[1] : text.replace(/\D/g, "");

        if (cleanPin.length !== 6) {
          session.state = "HUMAN_TAKEOVER_PROMPT";
          return this.renderHumanTakeoverPrompt(session.language);
        }

        session.formData.pincode = cleanPin;
        const rep = SalesRepDirectory.getRepByPin(cleanPin);
        session.formData.assignedAgent = rep;
        session.state = "FORM_INTEREST";

        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `आप किस उत्पाद श्रेणी (Product Category) में रुचि रखते हैं?\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories`
            : `Which product category are you interested in?\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories`,
        };
      }

      // ----------------------------------------------------
      // STATE 11: FORM - INTEREST & FINAL CRM SAVE
      // ----------------------------------------------------
      case "FORM_INTEREST": {
        const cat = CatalogueDirectory.getCategory(cleanChoice);
        const interestName = cat ? cat.name : "All Categories";
        session.formData.interestedCategory = interestName;

        // 1. Save Lead into CRM Database
        const Lead = getLeadModel();
        const Contact = getContactModel();
        const rep = session.formData.assignedAgent || (session.formData.pincode ? SalesRepDirectory.getRepByPin(session.formData.pincode) : SalesRepDirectory.getFallbackRep());
        const leadNumber = `RNL-${Math.floor(10000 + Math.random() * 90000)}`;

        const leadPhone = session.formData.mobile || session.phone;
        const cleanLeadDigits = leadPhone.replace(/\D/g, "");
        const formattedLeadPhone = cleanLeadDigits.startsWith("91") ? `+${cleanLeadDigits}` : `+91${cleanLeadDigits}`;

        try {
          await Lead.create({
            leadNumber,
            customerName: session.formData.name || customerName || "Customer",
            phone: formattedLeadPhone,
            businessType: session.customerType || "Dealer",
            city: rep.state,
            state: rep.state,
            productCategory: interestName,
            productInterest: [interestName],
            requirementDescription: `WhatsApp Lead: Interested in ${interestName}. Pincode: ${session.formData.pincode}`,
            leadSource: "WhatsApp_Inbound",
            assignedEmployeeName: rep.name,
            status: "NEW",
            priority: "HIGH",
            internalNotes: [`Assigned to ${rep.name} (${rep.mobile}) for ${rep.state} region via WhatsApp Bot`],
          });
          console.log(`✅ [FlowEngine] Created Lead ${leadNumber} for ${session.formData.name} -> Assigned to ${rep.name}`);
        } catch (leadErr: any) {
          console.error(`❌ [FlowEngine] Failed to save lead: ${leadErr.message}`);
        }

        // 1b. Upsert Contact Record for CRM Directory & Inbox Profile 360
        try {
          await Contact.findOneAndUpdate(
            { phone: { $in: [leadPhone, formattedLeadPhone, cleanLeadDigits] } },
            {
              $set: {
                phone: formattedLeadPhone,
                name: session.formData.name || customerName || "Customer",
                businessName: session.formData.name || "",
                businessType: session.customerType || "Dealer",
                city: rep.state,
                state: rep.state,
                pincode: session.formData.pincode || "",
                lastContactedAt: new Date(),
              },
              $setOnInsert: {
                isVerifiedDealer: false,
                tags: ["WhatsApp_Lead", session.customerType || "Dealer"],
              },
            },
            { upsert: true, new: true }
          );
        } catch (contactErr: any) {
          console.warn(`[FlowEngine] Contact upsert warning: ${contactErr.message}`);
        }

        // 2. Dispatch instant WhatsApp notification directly to Regional Sales Rep & Admin
        try {
          await FlowEngine.dispatchRepWhatsAppAlert(rep, {
            customerName: session.formData.name || customerName || "Customer",
            customerPhone: session.formData.mobile || session.phone,
            pincode: session.formData.pincode || "Pan-India",
            customerType: session.customerType || "Dealer",
            productCategory: interestName,
            leadNumber,
          });
        } catch (alertErr: any) {
          console.warn(`[FlowEngine] Rep notification warning: ${alertErr.message}`);
        }

        session.state = "COMPLETED";
        const custPhone = (session.formData.mobile || session.phone).replace(/\D/g, "");

        let finalMsg = "";
        const lang = session.language;
        if (lang === "pa") {
          finalMsg = `🎉 *ਧੰਨਵਾਦ ${session.formData.name}!* ਤੁਹਾਡੀ ਲੋੜ ਸਫਲਤਾਪੂਰਵਕ ਦਰਜ ਕਰ ਲਈ ਗਈ ਹੈ।\n\n`;
          finalMsg += `📋 *ਤੁਹਾਡੇ ਵੇਰਵੇ:*\n`;
          finalMsg += `• ਨਾਮ: ${session.formData.name}\n`;
          finalMsg += `• ਮੋਬਾਈਲ: +${custPhone}\n`;
          finalMsg += `• ਪਿਨ ਕੋਡ: ${session.formData.pincode} (${rep.state})\n`;
          finalMsg += `• ਸ਼੍ਰੇਣੀ: ${interestName}\n\n`;
          finalMsg += `👤 *ਤੁਹਾਡੇ ਖੇਤਰੀ ਸੇਲਜ਼ ਮੈਨੇਜਰ (Regional Sales Manager):*\n`;
          finalMsg += `• ਨਾਮ: *${rep.name}*\n`;
          finalMsg += `• ਮੋਬਾਈਲ: *${rep.mobile}*\n`;
          finalMsg += `• ਖੇਤਰ: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `ਸਾਡੀ ਸੇਲਜ਼ ਟੀਮ ਜਲਦੀ ਹੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੇਗੀ।\n\n`;
          finalMsg += `━━━━━━━━━━━━━━━━━━━\n`;
          finalMsg += `*ਤੁਸੀਂ ਅੱਗੇ ਕੀ ਦੇਖਣਾ ਚਾਹੁੰਦੇ ਹੋ? (What would you like to explore next?)*\n\n`;
          finalMsg += `1. 👤 Talk to Sales Team (ਸੇਲਜ਼ ਟੀਮ ਨਾਲ ਗੱਲ ਕਰੋ)\n`;
          finalMsg += `2. 📝 Submit Requirement (ਹੋਰ ਲੋੜ ਦਰਜ ਕਰੋ)\n`;
          finalMsg += `3. 📄 View Other Catalogues (ਹੋਰ ਕੈਟਾਲਾਗ ਦੇਖੋ)\n`;
          finalMsg += `4. 📞 Customer Care & Support (ਕਸਟਮਰ ਕੇਅਰ ਤੇ ਸ਼ਿਕਾਇਤ)\n`;
          finalMsg += `5. 🌐 Visit Official Website (ਵੈੱਬਸਾਈਟ ਦੇਖੋ - rnvalves.com)\n`;
          finalMsg += `6. 🏠 Main Menu (ਮੁੱਖ ਮੀਨੂ)\n\n`;
          finalMsg += `(1 ਤੋਂ 6 ਵਿੱਚੋਂ ਇੱਕ ਨੰਬਰ ਭੇਜੋ)`;
        } else if (lang === "hi") {
          finalMsg = `🎉 *धन्यवाद ${session.formData.name}!* आपकी आवश्यकता सफलतापूर्वक दर्ज कर ली गई है।\n\n`;
          finalMsg += `📋 *आपके विवरण:*\n`;
          finalMsg += `• नाम: ${session.formData.name}\n`;
          finalMsg += `• मोबाइल: +${custPhone}\n`;
          finalMsg += `• पिन कोड: ${session.formData.pincode} (${rep.state})\n`;
          finalMsg += `• प्रकार: ${session.customerType || "Dealer"}\n`;
          finalMsg += `• उत्पाद रुचि: ${interestName}\n\n`;
          finalMsg += `👤 *आपके क्षेत्रीय बिक्री प्रबंधक (Regional Sales Manager):*\n`;
          finalMsg += `• नाम: *${rep.name}*\n`;
          finalMsg += `• मोबाइल: *${rep.mobile}*\n`;
          finalMsg += `• क्षेत्र: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `हमारी बिक्री टीम आपसे अतिशीघ्र विशेष डीलर प्राइज लिस्ट के साथ संपर्क करेगी।\n\n`;
          finalMsg += `━━━━━━━━━━━━━━━━━━━\n`;
          finalMsg += `*आप आगे क्या देखना चाहेंगे? (What would you like to explore next?)*\n\n`;
          finalMsg += `1. 👤 Talk to Sales Team (सेल्स टीम से तुरंत बात करें)\n`;
          finalMsg += `2. 📝 Submit Requirement (अतिरिक्त आवश्यकता दर्ज करें)\n`;
          finalMsg += `3. 📄 View Other Catalogues (अन्य कैटलॉग देखें)\n`;
          finalMsg += `4. 📞 Customer Care & Support (कस्टमर केयर व शिकायत सहायता)\n`;
          finalMsg += `5. 🌐 Visit Official Website (वेबसाइट देखें - rnvalves.com)\n`;
          finalMsg += `6. 🏠 Main Menu (मुख्य मेन्यू)\n\n`;
          finalMsg += `(1 से 6 में से एक नंबर भेजें)`;
        } else {
          finalMsg = `🎉 *Thank you ${session.formData.name}!* Your requirement has been successfully submitted.\n\n`;
          finalMsg += `📋 *Your Details:*\n`;
          finalMsg += `• Name: ${session.formData.name}\n`;
          finalMsg += `• Mobile: +${custPhone}\n`;
          finalMsg += `• PIN Code: ${session.formData.pincode} (${rep.state})\n`;
          finalMsg += `• Type: ${session.customerType || "Dealer"}\n`;
          finalMsg += `• Category: ${interestName}\n\n`;
          finalMsg += `👤 *Your Regional Sales Representative:*\n`;
          finalMsg += `• Name: *${rep.name}*\n`;
          finalMsg += `• Mobile: *${rep.mobile}*\n`;
          finalMsg += `• Territory: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `Our sales team will connect with you shortly with exclusive pricing.\n\n`;
          finalMsg += `━━━━━━━━━━━━━━━━━━━\n`;
          finalMsg += `*What would you like to explore next?*\n\n`;
          finalMsg += `1. 👤 Talk to Sales Team\n`;
          finalMsg += `2. 📝 Submit Requirement\n`;
          finalMsg += `3. 📄 View Other Catalogues\n`;
          finalMsg += `4. 📞 Customer Care & Support\n`;
          finalMsg += `5. 🌐 Visit Official Website (rnvalves.com)\n`;
          finalMsg += `6. 🏠 Main Menu\n\n`;
          finalMsg += `(Please reply with 1 to 6)`;
        }

        return {
          replyText: finalMsg,
          mediaUrl: cat ? cat.pdfUrl : "https://rnvalves.com/uploads/aboutus/rn-catalogue-price-list-compressedpdf5kvoaov0mh23c3e2iedvrd0qhliikm.pdf",
          mediaType: "document",
          mediaFileName: cat ? `RN_Valves_${cat.id}.pdf` : "RN_Valves_Complete_Catalogue_PriceList.pdf",
          mediaCaption: `RN Valves & Faucets - ${interestName} Catalogue`,
        };
      }

      // ----------------------------------------------------
      // STATE 12: COMPLETED (SHOW OTHER OPTIONS)
      // ----------------------------------------------------
      case "COMPLETED": {
        if (cleanChoice === "1" || norm.includes("sales") || norm.includes("talk") || norm.includes("team") || norm.includes("baat")) {
          const rep = session.formData.assignedAgent || (session.formData.pincode ? SalesRepDirectory.getRepByPin(session.formData.pincode) : SalesRepDirectory.getFallbackRep());
          session.state = "SALES_REP_SHOWN";
          return this.renderSalesRepCard(session.language, rep, session.formData.pincode || "Pan-India");
        }

        if (cleanChoice === "2" || norm.includes("submit") || norm.includes("requirement") || norm.includes("need") || norm.includes("quote")) {
          session.state = "FORM_INTEREST";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `📝 *नई आवश्यकता / पूछताछ दर्ज करें*\n\nकृपया बताएं कि आप किस उत्पाद श्रेणी (Product Category) या मॉडल में रुचि रखते हैं:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 से 7 में से एक नंबर भेजें या सीधे आइटम कोड लिखें)`
              : `📝 *Submit Requirement / Inquiry*\n\nPlease select the product category or item you are interested in:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(Reply with 1 to 7 or send item codes directly)`,
          };
        }

        if (cleanChoice === "3" || norm.includes("catalog") || norm.includes("other") || norm.includes("category")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (cleanChoice === "4" || norm.includes("care") || norm.includes("complaint") || norm.includes("support") || norm.includes("shikayat") || norm.includes("service")) {
          return this.renderCustomerCareCard(session.language);
        }

        if (cleanChoice === "5" || norm.includes("website") || norm.includes("site") || norm.includes("online")) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `🌐 *RN Valves & Faucets आधिकारिक वेबसाइट:*\nhttps://rnvalves.com\n\nयहाँ आप हमारे 200+ प्रीमियम ब्रास व PTMT उत्पाद, तकनीकी विवरण एवं वारंटी देख सकते हैं।\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`
              : `🌐 *RN Valves & Faucets Official Website:*\nhttps://rnvalves.com\n\nExplore our full range of 200+ premium brass & PTMT faucets, technical specs & warranties.\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`,
          };
        }

        if (cleanChoice === "6" || norm.includes("main menu") || norm.includes("menu") || norm.includes("home")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        session.state = "HUMAN_TAKEOVER_PROMPT";
        return this.renderHumanTakeoverPrompt(session.language);
      }

      // ----------------------------------------------------
      // STATE 13: HUMAN TAKEOVER PROMPT
      // ----------------------------------------------------
      case "HUMAN_TAKEOVER_PROMPT": {
        const isYes =
          cleanChoice === "1" ||
          /^(yes|ha|haan|han|agent|human|executive|person|baat|connect|help|bulao|chahiye|insaan|man)$/i.test(norm) ||
          /takeover|take over/i.test(norm);
        const isNo =
          cleanChoice === "2" ||
          /^(no|nahi|na|menu|main menu|home|back|cancel|wapas)$/i.test(norm);

        if (isYes) {
          // Switch to Human Mode in ConversationControl
          try {
            const ConversationControl = getConversationControlModel();
            const cleanDigits = session.phone.replace(/\D/g, "");
            const phoneVariants = [
              session.phone,
              `+${cleanDigits}`,
              cleanDigits,
              cleanDigits.startsWith("91") ? `+${cleanDigits}` : `+91${cleanDigits}`,
            ];
            await ConversationControl.updateMany(
              { phone: { $in: phoneVariants } },
              {
                $set: {
                  mode: "human",
                  pauseReason: "Customer requested human takeover via chat",
                  lastCustomerMessageAt: new Date(),
                },
              },
              { upsert: true }
            );
          } catch (e: any) {
            console.warn(`[FlowEngine] Failed to update ConversationControl to human mode: ${e.message}`);
          }

          // Forward internal alert into Chatwoot conversation
          try {
            const ConversationControl = getConversationControlModel();
            const control = await ConversationControl.findOne({ phone: session.phone });
            if (control?.chatwootConversationId) {
              await chatwootClient.createMessage({
                conversationId: Number(control.chatwootConversationId),
                content: `🚨 [Alert]: Customer ${session.formData.name || session.phone} requested Human Takeover from WhatsApp. AI auto-reply is now paused for this chat.`,
                messageType: "incoming",
              });
            }
          } catch (e: any) {}

          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `✅ *ह्यूमन टेकओवर एक्टिव (Human Takeover Activated)*\n\n` +
                `आपको हमारे लाइव कस्टमर सपोर्ट / सेल्स प्रतिनिधि से कनेक्ट कर दिया गया है।\n\n` +
                `👨‍💼 हमारे प्रतिनिधि अतिशीघ्र इसी चैट पर आपसे सीधे बात करेंगे।\n\n` +
                `☎️ *तत्काल सहायता के लिए कॉल करें:* 1800 12340 0400 (टोल-फ्री) या +91 93151 60881\n\n` +
                `(बॉट को दोबारा चालू करने के लिए कभी भी *#aion* या *Menu* लिखें)`
              : `✅ *Human Takeover Activated*\n\n` +
                `You have been connected directly with our Live Support / Sales Team.\n\n` +
                `👨‍💼 Our representative will reply to you on this chat shortly.\n\n` +
                `☎️ *For immediate assistance, call:* 1800 12340 0400 (Toll-Free) or +91 93151 60881\n\n` +
                `(To restart the AI bot anytime, simply type *#aion* or *Menu*)`,
          };
        }

        if (isNo) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        return this.renderHumanTakeoverPrompt(session.language);
      }

      default: {
        session.state = "LANGUAGE_SELECTION";
        return this.renderLanguageSelection();
      }
    }
  }

  // ==========================================
  // RENDER HELPERS
  // ==========================================

  private static renderHumanTakeoverPrompt(lang: string): FlowResponse {
    let msg = "";
    if (lang === "hi") {
      msg = `🤖 *RN Valves AI असिस्टेंट*\n\n` +
        `माफ़ कीजिए, मैं केवल RN Valves के आधिकारिक मेन्यू व तय विकल्पों में सहायता कर सकता हूँ।\n\n` +
        `क्या आप हमारे कस्टमर सपोर्ट / सेल्स प्रतिनिधि से सीधे बात करना चाहते हैं?\n\n` +
        `1. 👨‍💼 हाँ, प्रतिनिधि से सीधे बात करनी है (Human Takeover)\n` +
        `2. 🏠 मुख्य मेन्यू पर जाएं (Main Menu)\n\n` +
        `(कृपया 1 या 2 भेजें)`;
    } else if (lang === "pa") {
      msg = `🤖 *RN Valves AI ਅਸਿਸਟੈਂਟ*\n\n` +
        `ਮਾਫ਼ ਕਰਨਾ, ਮੈਂ ਸਿਰਫ਼ RN Valves ਦੇ ਅਧਿਕਾਰਤ ਮੀਨੂ ਅਤੇ ਚੋਣਾਂ ਵਿੱਚ ਸਹਾਇਤਾ ਕਰ ਸਕਦਾ ਹਾਂ।\n\n` +
        `ਕੀ ਤੁਸੀਂ ਸਾਡੇ ਕਸਟਮਰ ਸਪੋਰਟ / ਸੇਲਜ਼ ਪ੍ਰਤੀਨਿਧੀ ਨਾਲ ਸਿੱਧਾ ਗੱਲ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ?\n\n` +
        `1. 👨‍💼 ਹਾਂ, ਪ੍ਰਤੀਨਿਧੀ ਨਾਲ ਗੱਲ ਕਰੋ (Human Takeover)\n` +
        `2. 🏠 ਮੁੱਖ ਮੀਨੂ 'ਤੇ ਜਾਓ (Main Menu)\n\n` +
        `(ਕਿਰਪਾ ਕਰਕੇ 1 ਜਾਂ 2 ਭੇਜੋ)`;
    } else {
      msg = `🤖 *RN Valves AI Assistant*\n\n` +
        `I can only assist you through RN Valves official options and catalog services.\n\n` +
        `Would you like to connect directly with our Live Support / Sales Representative?\n\n` +
        `1. 👨‍💼 Yes, connect with Human Agent (Human Takeover)\n` +
        `2. 🏠 Return to Main Menu\n\n` +
        `(Please reply with 1 or 2)`;
    }
    return { replyText: msg };
  }

  private static renderLanguageSelection(prefixMsg: string = ""): FlowResponse {
    let msg = "";
    if (prefixMsg) msg += `${prefixMsg}\n\n`;
    msg += `Welcome to *RN Valves & Faucets*! 🙏✨\n`;
    msg += `Please select your preferred language:\n\n`;
    msg += `--- Languages ---\n`;
    msg += `1. English\n`;
    msg += `2. Hindi / हिंदी\n`;
    msg += `3. Telugu / తెలుగు\n`;
    msg += `4. Tamil / தமிழ்\n`;
    msg += `5. Punjabi / ਪੰਜਾਬੀ\n`;
    msg += `6. Urdu / اردو\n\n`;
    msg += `(Reply with *1*, *2*, or your language name)`;

    return { replyText: msg };
  }

  private static renderRequirementType(lang: string): FlowResponse {
    let msg = "";
    if (lang === "pa") {
      msg += `*RN Valves & Faucets* ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ! 🙏\n\n`;
      msg += `ਸਭ ਤੋਂ ਪਹਿਲਾਂ ਦੱਸੋ, ਤੁਹਾਡੀ ਲੋੜ ਕਿਸ ਲਈ ਹੈ?\n`;
      msg += `1. 🏢 Distributor (ਡਿਸਟ੍ਰੀਬਿਊਟਰ)\n`;
      msg += `2. 🏪 Dealer (ਡੀਲਰ)\n`;
      msg += `3. 🛍️ Retailer (ਰਿਟੇਲਰ)\n`;
      msg += `4. 🏠 Personal Use (ਘਰ ਲਈ)\n`;
      msg += `5. 📦 Website Order Enquiries (ਆਨਲਾਈਨ ਆਰਡਰ)\n`;
      msg += `6. 🌐 ਭਾਸ਼ਾ ਬਦਲੋ (Change Language)\n\n`;
      msg += `(ਕਿਰਪਾ ਕਰਕੇ 1 ਤੋਂ 6 ਵਿੱਚੋਂ ਇੱਕ ਚੁਣੋ)`;
    } else if (lang === "hi") {
      msg += `*RN Valves & Faucets* में आपका स्वागत है! 🙏\n\n`;
      msg += `सबसे पहले बताइए, आपकी आवश्यकता किसके लिए है?\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use (घर के लिए)\n`;
      msg += `5. 📦 Website Order Enquiries (वेबसाइट ऑर्डर पूछताछ)\n`;
      msg += `6. 🌐 भाषा बदलें (Change Language)\n\n`;
      msg += `(कृपया 1 से 6 में से एक विकल्प चुनें)`;
    } else if (lang === "te") {
      msg += `*RN Valves & Faucets* కు స్వాగతం! 🙏\n\n`;
      msg += `మీకు దేని కోసం సహాయం కావాలి?\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use (వ్యక్తిగత ఉపయోగం)\n`;
      msg += `5. 📦 Website Order Enquiries (వెబ్‌సైట్ ఆర్డర్ విచారణ)\n`;
      msg += `6. 🌐 భాష మార్చండి (Change Language)\n\n`;
      msg += `(దయచేసి 1 నుండి 6 వరకు ఎంచుకోండి)`;
    } else if (lang === "ta") {
      msg += `*RN Valves & Faucets* உங்களை வரவேற்கிறது! 🙏\n\n`;
      msg += `உங்கள் தேவை என்னவென்று குறிப்பிடவும்:\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use (சொந்த பயன்பாடு)\n`;
      msg += `5. 📦 Website Order Enquiries (இணையதள ஆர்டர் விசாரணை)\n`;
      msg += `6. 🌐 மொழியை மாற்றவும் (Change Language)\n\n`;
      msg += `(1 முதல் 6 வரை தேர்வு செய்யவும்)`;
    } else if (lang === "ur") {
      msg += `*RN Valves & Faucets* میں خوش آمدید! 🙏\n\n`;
      msg += `سب سے پہلے بتائیں آپ کی ضرورت کس کے لیے ہے؟\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use (ذاتی استعمال)\n`;
      msg += `5. 📦 Website Order Enquiries (آن لائن آرڈر پوچھ گچھ)\n`;
      msg += `6. 🌐 زبان تبدیل کریں (Change Language)\n\n`;
      msg += `(براہ کرم 1 سے 6 میں سے انتخاب کریں)`;
    } else {
      msg += `Welcome to *RN Valves & Faucets*! 🙏\n\n`;
      msg += `First, please tell us what you are looking for:\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use\n`;
      msg += `5. 📦 Website Order Enquiries\n`;
      msg += `6. 🌐 Change Language\n\n`;
      msg += `(Please reply with 1 to 6)`;
    }

    return { replyText: msg };
  }

  private static renderWebsiteOrderSupport(lang: string): FlowResponse {
    let msg = "";
    if (lang === "pa") {
      msg = `📦 *RN Valves ਵੈੱਬਸਾਈਟ ਅਤੇ ਆਨਲਾਈਨ ਆਰਡਰ ਸਹਾਇਤਾ*\n\nਜੇਕਰ ਤੁਸੀਂ rnvalves.com 'ਤੇ ਆਰਡਰ ਦਿੱਤਾ ਹੈ ਜਾਂ ਵੈੱਬਸਾਈਟ ਆਰਡਰ ਸੰਬੰਧੀ ਕੋਈ ਸਹਾਇਤਾ ਚਾਹੀਦੀ ਹੈ, ਤਾਂ ਤੁਸੀਂ ਸਿੱਧੇ ਸਾਡੇ ਈ-ਕਾਮਰਸ ਐਗਜ਼ੀਕਿਊਟਿਵ ਨਾਲ ਸੰਪਰਕ ਕਰ ਸਕਦੇ ਹੋ:\n\n👤 *ਈ-ਕਾਮਰਸ ਐਗਜ਼ੀਕਿਊਟਿਵ (E-Commerce Executive):*\n📞 *ਸੰਪਰਕ / WhatsApp:* +91 93156 03920\n🌐 *ਆਨਲਾਈਨ ਸਟੋਰ:* https://rnvalves.com\n\nਜੇਕਰ ਤੁਹਾਡੇ ਕੋਲ *Order ID* ਹੈ, ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਇੱਥੇ ਲਿਖ ਕੇ ਭੇਜੋ, ਸਾਡੀ ਟੀਮ ਤੁਰੰਤ ਸਟੇਟਸ ਚੈੱਕ ਕਰੇਗੀ!\n\n(ਮੁੱਖ ਮੇਨੂ ਲਈ *Menu* ਲਿਖੋ)`;
    } else if (lang === "hi") {
      msg = `📦 *RN Valves वेबसाइट और ऑनलाइन ऑर्डर सहायता*\n\nयदि आपने https://rnvalves.com पर ऑर्डर दिया है या वेबसाइट ऑर्डर के संबंध में कोई सहायता चाहिए, तो आप सीधे हमारे ई-कॉमर्स एग्जीक्यूटिव से संपर्क कर सकते हैं:\n\n👤 *ई-कॉमर्स एग्जीक्यूटिव (E-Commerce Executive):*\n📞 *कॉल / व्हाट्सएप:* +91 93156 03920\n🌐 *आधिकारिक स्टोर:* https://rnvalves.com\n\nयदि आपके पास *Order ID* है, तो कृपया यहाँ लिखकर भेजें, हमारी टीम तुरंत स्टेटस चेक करेगी!\n\n(मुख्य मेन्यू के लिए *Menu* लिखें)`;
    } else if (lang === "te") {
      msg = `📦 *RN Valves వెబ్‌సైట్ మరియు ఆన్‌లైన్ ఆర్డర్ సహాయం*\n\nమీరు rnvalves.com లో ఆర్డర్ చేసి ఉంటే లేదా వెబ్‌సైట్ ఆర్డర్ సహాయం కోసం, మీరు నేరుగా మా ఇ-కామర్స్ ఎగ్జిక్యూటివ్‌ని సంప్రదించవచ్చు:\n\n👤 *ఇ-కామర్స్ ఎగ్జిక్యూటివ్ (E-Commerce Executive):*\n📞 *కాల్ / WhatsApp:* +91 93156 03920\n🌐 *స్టోర్:* https://rnvalves.com\n\nమీ వద్ద *Order ID* ఉంటే, దయచేసి ఇక్కడ పంపండి!\n\n(ప్రధాన మెనూ కోసం *Menu* అని టైప్ చేయండి)`;
    } else if (lang === "ta") {
      msg = `📦 *RN Valves இணையதள ஆன்லைன் ஆர்டர் ஆதரவு*\n\nநீங்கள் rnvalves.com இல் ஆர்டர் செய்திருந்தால் அல்லது இணையதள ஆர்டர் உதவிக்கு, எங்கள் இ-காமர்ஸ் நிர்வாகியை நேரடியாக தொடர்பு கொள்ளலாம்:\n\n👤 *இ-காமர்ஸ் நிர்வாகி (E-Commerce Executive):*\n📞 *அழைப்பு / WhatsApp:* +91 93156 03920\n🌐 *ஸ்டோர்:* https://rnvalves.com\n\nஉங்களிடம் *Order ID* இருந்தால், தயவுசெய்து இங்கே அனுப்பவும்!\n\n(முதன்மை மெனுவுக்கு *Menu* என தட்டச்சு செய்யவும்)`;
    } else if (lang === "ur") {
      msg = `📦 *RN Valves ویب سائٹ اور آن لائن آرڈر سپورٹ*\n\nاگر آپ نے rnvalves.com پر آرڈر دیا ہے یا آن لائن آرڈر سے متعلق رہنمائی چاہیے، تو آپ براہ راست ہمارے ای کامرس ایگزیکٹو سے رابطہ کر سکتے ہیں:\n\n👤 *ای کامرس ایگزیکٹو (E-Commerce Executive):*\n📞 *کال / واٹس ایپ:* +91 93156 03920\n🌐 *اسٹور:* https://rnvalves.com\n\nاگر آپ کے پاس *Order ID* ہے، تو براہ کرم یہاں لکھ کر بھیجیں!\n\n(مین مینو کے لیے *Menu* لکھیں)`;
    } else {
      msg = `📦 *RN Valves Website & Online Order Support*\n\nIf you have placed an order on https://rnvalves.com or need assistance regarding website orders, you can connect directly with our E-Commerce Executive:\n\n👤 *E-Commerce Executive:*\n📞 *Call / WhatsApp:* +91 93156 03920\n🌐 *Official Store:* https://rnvalves.com\n\nIf you have an *Order ID*, please reply with your Order ID here, and our team will check the status immediately!\n\n(Type *Menu* to return to the main menu)`;
    }
    return { replyText: msg };
  }

  private static renderCustomerCareCard(lang: string): FlowResponse {
    let msg = "";
    if (lang === "hi") {
      msg = `📞 *RN Valves आधिकारिक कस्टमर केयर व सपोर्ट*\n\n` +
        `आप हमारी सहायता टीम से सीधे संपर्क कर सकते हैं:\n\n` +
        `☎️ *टोल-फ्री कस्टमर केयर:* 1800 12340 0400\n` +
        `🛠️ *शिकायत व सर्विस डेस्क:* +91 98912 01208\n` +
        `📧 *आधिकारिक ईमेल:* enquiry@rnvalves.com\n` +
        `📦 *वेबसाइट ऑर्डर सहायता:* +91 93156 03920 (E-Commerce Desk)\n` +
        `👤 *सेल्स व डीलरशिप हेल्पलाइन:* +91 93151 60881 (Amit Kumar Sir)\n` +
        `⏰ *समय:* सुबह 10:00 से शाम 7:00 (सोम-शनि)\n\n` +
        `📍 *अपने क्षेत्र के रीजनल सेल्स मैनेजर से जुड़ने के लिए अपना 6-अंकीय एरिया पिन कोड भेजें!*\n\n` +
        `मुख्य मेन्यू के लिए *Menu* लिखें।`;
    } else if (lang === "pa") {
      msg = `📞 *RN Valves ਅਧਿਕਾਰਤ ਕਸਟਮਰ ਕੇਅਰ ਅਤੇ ਸਹਾਇਤਾ*\n\n` +
        `ਤੁਸੀਂ ਸਾਡੀ ਸਹਾਇਤਾ ਟੀਮ ਨਾਲ ਸਿੱਧਾ ਸੰਪਰਕ ਕਰ ਸਕਦੇ ਹੋ:\n\n` +
        `☎️ *ਟੋਲ-ਫ੍ਰੀ ਕਸਟਮਰ ਕੇਅਰ:* 1800 12340 0400\n` +
        `🛠️ *ਸ਼ਿਕਾਇਤ ਅਤੇ ਸਰਵਿਸ ਡੈਸਕ:* +91 98912 01208\n` +
        `📧 *ਅਧਿਕਾਰਤ ਈਮੇਲ:* enquiry@rnvalves.com\n` +
        `📦 *ਵੈੱਬਸਾਈਟ ਆਰਡਰ ਸਹਾਇਤਾ:* +91 93156 03920\n` +
        `👤 *ਸੇਲਜ਼ ਹੈਲਪਲਾਈਨ:* +91 93151 60881 (Amit Kumar Sir)\n` +
        `⏰ *ਸਮਾਂ:* ਸਵੇਰੇ 10:00 ਤੋਂ ਸ਼ਾਮ 7:00 (ਸੋਮ-ਸ਼ਨੀ)\n\n` +
        `ਮੁੱਖ ਮੀਨੂ ਲਈ *Menu* ਲਿਖੋ।`;
    } else {
      msg = `📞 *RN Valves Official Customer Care & Support*\n\n` +
        `You can reach our dedicated support departments directly:\n\n` +
        `☎️ *Toll-Free Customer Care:* 1800 12340 0400\n` +
        `🛠️ *Complaint & Service Desk:* +91 98912 01208\n` +
        `📧 *Official Email:* enquiry@rnvalves.com\n` +
        `📦 *Website & Online Orders:* +91 93156 03920 (E-Commerce Desk)\n` +
        `👤 *Sales & Dealership Helpline:* +91 93151 60881 (Amit Kumar Sir)\n` +
        `⏰ *Working Hours:* 10:00 AM - 7:00 PM (Mon-Sat)\n\n` +
        `📍 *To connect directly with your Regional Sales Manager, please reply with your 6-digit Area PIN Code.*\n\n` +
        `Type *Menu* to return to the main menu.`;
    }
    return { replyText: msg };
  }

  private static renderBusinessMenu(lang: string, customerType: string): FlowResponse {
    let msg = "";
    if (lang === "pa") {
      msg += `*${customerType} Business Menu*\n`;
      msg += `ਕਿਰਪਾ ਕਰਕੇ ਚੁਣੋ ਕਿ ਤੁਹਾਨੂੰ ਕਿਸ ਸੰਬੰਧ ਵਿੱਚ ਸਹਾਇਤਾ ਚਾਹੀਦੀ ਹੈ:\n\n`;
      msg += `1. 📄 Product Catalogues (ਉਤਪਾਦ ਕੈਟਾਲਾਗ)\n`;
      msg += `2. 💰 Pricing & Sales Team (ਕੀਮਤ / ਸੇਲਜ਼ ਟੀਮ)\n`;
      msg += `3. 📝 Submit Requirement (ਲੋੜ ਦਰਜ ਕਰੋ)\n`;
      msg += `4. 📞 Customer Care & Support (ਕਸਟਮਰ ਕੇਅਰ ਤੇ ਸ਼ਿਕਾਇਤ)\n`;
      msg += `5. 🏠 Main Menu (ਮੁੱਖ ਮੀਨੂ)\n\n`;
      msg += `(ਕਿਰਪਾ ਕਰਕੇ 1 ਤੋਂ 5 ਵਿੱਚੋਂ ਚੁਣੋ)`;
    } else if (lang === "hi") {
      msg += `*${customerType} Business Menu*\n`;
      msg += `कृपया चुनें कि आपको किस संबंध में सहायता चाहिए:\n\n`;
      msg += `1. 📄 Product Catalogues (उत्पाद कैटलॉग)\n`;
      msg += `2. 💰 Pricing & Sales Team (मूल्य व सेल्स टीम)\n`;
      msg += `3. 📝 Submit Requirement (आवश्यकता दर्ज करें)\n`;
      msg += `4. 📞 Customer Care & Support (कस्टमर केयर व शिकायत)\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(कृपया 1 से 5 में से चुनें)`;
    } else if (lang === "te") {
      msg += `*${customerType} Business Menu*\n`;
      msg += `మీకు ఎలా సహాయం చేయగలమో ఎంచుకోండి:\n\n`;
      msg += `1. 📄 Product Catalogues (ఉత్పత్తి కేటలాగ్‌లు)\n`;
      msg += `2. 💰 Pricing & Sales Team (ధరలు / సేల్స్ టీమ్)\n`;
      msg += `3. 📝 Submit Requirement (మీ అవసరాన్ని సమర్పించండి)\n`;
      msg += `4. 📞 Customer Care & Support (కస్టమర్ కేర్ & ఫిర్యాదులు)\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(1 నుండి 5 వరకు ఎంచుకోండి)`;
    } else if (lang === "ta") {
      msg += `*${customerType} Business Menu*\n`;
      msg += `உங்களுக்கு தேவையான சேவையை தேர்ந்தெடுக்கவும்:\n\n`;
      msg += `1. 📄 Product Catalogues (தயாரிப்பு அட்டவணை)\n`;
      msg += `2. 💰 Pricing & Sales Team (விலை / விற்பனை குழு)\n`;
      msg += `3. 📝 Submit Requirement (உங்கள் தேவையை சமர்ப்பிக்க)\n`;
      msg += `4. 📞 Customer Care & Support (வாடிக்கையாளர் சேவை & புகார்கள்)\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(1 முதல் 5 வரை தேர்வு செய்யவும்)`;
    } else if (lang === "ur") {
      msg += `*${customerType} Business Menu*\n`;
      msg += `برائے مہربانی منتخب کریں कि آپ کو کس بارے میں مدد چاہیے:\n\n`;
      msg += `1. 📄 Product Catalogues (پروڈکٹ کیٹلاگ)\n`;
      msg += `2. 💰 Pricing & Sales Team (قیمت اور سیلز ٹیم)\n`;
      msg += `3. 📝 Submit Requirement (اپنی ضرورت درج کریں)\n`;
      msg += `4. 📞 Customer Care & Support (کسٹمر کیئر و شکایات)\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(براہ کرم 1 سے 5 میں سے انتخاب کریں)`;
    } else {
      msg += `*${customerType} Business Menu*\n`;
      msg += `Please select how we can assist you:\n\n`;
      msg += `1. 📄 Product Catalogues\n`;
      msg += `2. 💰 Pricing & Sales Team\n`;
      msg += `3. 📝 Submit Requirement\n`;
      msg += `4. 📞 Customer Care & Support (Toll-Free & Complaints)\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(Please reply with 1 to 5)`;
    }

    return { replyText: msg };
  }

  private static renderCategorySelection(lang: string): FlowResponse {
    let msg = "";
    if (lang === "pa") {
      msg += `ਕਿਰਪਾ ਕਰਕੇ ਉਤਪਾਦ ਸ਼੍ਰੇਣੀ (Product Category) ਦੀ ਚੋਣ ਕਰੋ:\n\n`;
      msg += `1. CP Faucets (ਬ੍ਰਾਸ ਨਲ)\n`;
      msg += `2. PTMT Faucets (ਪੀਟੀਐਮਟੀ ਨਲ)\n`;
      msg += `3. Accessories (ਬਾਥਰੂਮ ਐਕਸੈਸਰੀਜ਼)\n`;
      msg += `4. Health Faucets (ਹੈਲਥ ਫ਼ੌਸੇਟ)\n`;
      msg += `5. Showers (ਸ਼ਾਵਰ)\n`;
      msg += `6. Ball Valves (ਬਾਲ ਵਾਲਵ)\n`;
      msg += `7. All Categories (ਸੰਪੂਰਨ ਮਾਸਟਰ ਕੈਟਾਲਾਗ)\n`;
      msg += `8. 🏠 Main Menu\n\n`;
      msg += `(1 ਤੋਂ 8 ਵਿੱਚੋਂ ਇੱਕ ਨੰਬਰ ਭੇਜੋ)`;
    } else if (lang === "hi") {
      msg += `कृपया उस उत्पाद श्रेणी (Product Category) का चयन करें:\n\n`;
      msg += `1. CP Faucets\n`;
      msg += `2. PTMT Faucets\n`;
      msg += `3. Accessories\n`;
      msg += `4. Health Faucets\n`;
      msg += `5. Showers\n`;
      msg += `6. Ball Valves\n`;
      msg += `7. All Categories (सम्पूर्ण कैटलॉग)\n`;
      msg += `8. 🏠 Main Menu\n\n`;
      msg += `(1 से 8 में से एक नंबर भेजें)`;
    } else {
      msg += `Please select the product category for the catalogue:\n\n`;
      msg += `1. CP Faucets\n`;
      msg += `2. PTMT Faucets\n`;
      msg += `3. Accessories\n`;
      msg += `4. Health Faucets\n`;
      msg += `5. Showers\n`;
      msg += `6. Ball Valves\n`;
      msg += `7. All Categories\n`;
      msg += `8. 🏠 Main Menu\n\n`;
      msg += `(Reply with 1 to 8)`;
    }

    return { replyText: msg };
  }

  private static renderSalesRepCard(lang: string, rep: SalesRep, pinCode: string): FlowResponse {
    const cleanRepPhone = rep.mobile.replace(/\D/g, "");
    let msg = "";
    if (lang === "pa") {
      msg += `📍 *ਖੇਤਰ ਲੱਭਿਆ:* ਪਿਨ ਕੋਡ ${pinCode} (${rep.state})\n\n`;
      msg += `ਤੁਹਾਡੇ ਖੇਤਰੀ ਸੇਲਜ਼ ਮੈਨੇਜਰ ਦੇ ਸੰਪਰਕ ਵੇਰਵੇ:\n\n`;
      msg += `👤 *ਨਾਮ:* ${rep.name}\n`;
      msg += `📱 *ਮੋਬਾਈਲ:* ${rep.mobile}\n`;
      msg += `💬 *WhatsApp:* https://wa.me/${cleanRepPhone}\n`;
      msg += `📍 *ਖੇਤਰ:* ${rep.area} (${rep.state})\n\n`;
      msg += `ਤੁਸੀਂ ਅੱਗੇ ਕੀ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ?\n`;
      msg += `1. 📝 Submit Requirement (ਲੋੜ ਦਰਜ ਕਰੋ)\n`;
      msg += `2. 📄 View Other Catalogues (ਕੈਟਾਲਾਗ ਦੇਖੋ)\n`;
      msg += `3. 📞 Customer Care & Support (ਕਸਟਮਰ ਕੇਅਰ)\n`;
      msg += `4. 🏠 Main Menu`;
    } else if (lang === "hi") {
      msg += `📍 *क्षेत्र खोज:* पिन कोड ${pinCode} (${rep.state})\n\n`;
      msg += `यहाँ आपके क्षेत्रीय बिक्री प्रबंधक (Regional Sales Manager) के संपर्क विवरण हैं:\n\n`;
      msg += `👤 *नाम:* ${rep.name}\n`;
      msg += `📱 *मोबाइल:* ${rep.mobile}\n`;
      msg += `💬 *WhatsApp चैट:* https://wa.me/${cleanRepPhone}\n`;
      msg += `📍 *क्षेत्र:* ${rep.area} (${rep.state})\n\n`;
      msg += `आप आगे क्या करना चाहेंगे?\n`;
      msg += `1. 📝 Submit Requirement (आवश्यकता दर्ज करें)\n`;
      msg += `2. 📄 View Other Catalogues (कैटलॉग देखें)\n`;
      msg += `3. 📞 Customer Care & Support (कस्टमर केयर सहायता)\n`;
      msg += `4. 🏠 Main Menu`;
    } else {
      msg += `📍 *Region Located:* PIN Code ${pinCode} (${rep.state})\n\n`;
      msg += `Here are the direct contact details for your Regional Sales Manager:\n\n`;
      msg += `👤 *Name:* ${rep.name}\n`;
      msg += `📱 *Mobile:* ${rep.mobile}\n`;
      msg += `💬 *Direct WhatsApp:* https://wa.me/${cleanRepPhone}\n`;
      msg += `📍 *Territory:* ${rep.area} (${rep.state})\n\n`;
      msg += `How would you like to proceed?\n`;
      msg += `1. 📝 Submit Requirement\n`;
      msg += `2. 📄 View Other Catalogues\n`;
      msg += `3. 📞 Customer Care & Support\n`;
      msg += `4. 🏠 Main Menu`;
    }

    return { replyText: msg };
  }
}
