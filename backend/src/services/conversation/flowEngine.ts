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
      isRepeat?: boolean;
      previousLeadNumber?: string;
    }
  ): Promise<void> {
    const effectiveRep = rep || SalesRepDirectory.getFallbackRep();
    const cleanRepPhone = (effectiveRep.mobile || "+91 93151 60881").replace(/\D/g, "");
    const customerPhone = leadDetails.customerPhone.replace(/\D/g, "");

    const alertTitle = leadDetails.isRepeat
      ? `🔄 *पुनः पूछताछ अलर्ट! (Repeat Enquiry - Existing Customer)*`
      : `🚨 *नई डीलर लीड अलर्ट! (New WhatsApp Lead)*`;

    let alertToRep =
      `${alertTitle}\n\n` +
      `नमस्ते *${effectiveRep.name} ji*,\n` +
      `आपके क्षेत्र (*${effectiveRep.area}*) से ग्राहक की पूछताछ दर्ज हुई है:\n\n` +
      `👤 *ग्राहक/फर्म:* ${leadDetails.customerName}\n` +
      `📞 *मोबाइल:* +${customerPhone}\n` +
      `📍 *पिन कोड:* ${leadDetails.pincode} (${effectiveRep.state})\n` +
      `🏷️ *प्रकार:* ${leadDetails.customerType || "Dealer"}\n` +
      `📦 *उत्पाद श्रेणी:* ${leadDetails.productCategory}\n` +
      `🆔 *लीड आईडी:* ${leadDetails.leadNumber}\n`;

    if (leadDetails.isRepeat && leadDetails.previousLeadNumber) {
      alertToRep += `ℹ️ *पूर्व संदर्भ:* यह ग्राहक पहले भी इन्क्वायरी कर चुका है (Previous Lead: ${leadDetails.previousLeadNumber})\n`;
    }

    alertToRep += `\n⚡ कृपया तुरंत ग्राहक से संपर्क करके आवश्यक डील क्लोज करें!`;

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

      const finalName = (personName ? FlowEngine.sanitizeAndExtractName(personName) : "") || (shopName ? FlowEngine.sanitizeAndExtractName(shopName) : "") || customerName || "Customer";
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
          const lang = session.language;
          let pMsg = "";
          if (lang === "pa") {
            pMsg = `ਕਿਉਂਕਿ ਤੁਸੀਂ ਨਿੱਜੀ ਵਰਤੋਂ (Personal Use) ਲਈ ਉਤਪਾਦ ਲੱਭ ਰਹੇ ਹੋ, ਤੁਸੀਂ ਸਾਡੀ ਅਧਿਕਾਰਤ ਵੈੱਬਸਾਈਟ ਤੋਂ ਸਿੱਧੇ ਉਤਪਾਦ ਦੇਖ ਅਤੇ ਖਰੀਦ ਸਕਦੇ ਹੋ।\n\n🌐 *ਵੈੱਬਸਾਈਟ:* https://rnvalves.com\n\nਮੁੱਖ ਮੀਨੂ 'ਤੇ ਵਾਪਸ ਜਾਣ ਲਈ *Main Menu* ਜਾਂ *Hi* ਲਿਖੋ।`;
          } else if (lang === "te") {
            pMsg = `మీరు వ్యక్తిగత ఉపయోగం (Personal Use) కోసం ఉత్పత్తులను చూస్తున్నందున, మీరు మా అధికారిక వెబ్‌సైట్ నుండి నేరుగా కొనుగోలు చేయవచ్చు.\n\n🌐 *వెబ్‌సైట్:* https://rnvalves.com\n\nప్రధాన మెను కోసం ఎప్పుడైనా *Main Menu* లేదా *Hi* అని టైప్ చేయండి.`;
          } else if (lang === "ta") {
            pMsg = `நீங்கள் தனிப்பட்ட பயன்பாட்டிற்காக (Personal Use) தயாரிப்புகளைத் தேடுவதால், எங்கள் அதிகாரப்பூர்வ இணையதளத்தில் நேரடியாகப் பார்க்கலாம்.\n\n🌐 *இணையதளம்:* https://rnvalves.com\n\nமுதன்மை மெனுவுக்கு *Main Menu* அல்லது *Hi* என தட்டச்சு செய்யவும்.`;
          } else if (lang === "ur") {
            pMsg = `چونکہ آپ ذاتی استعمال (Personal Use) کے لیے پراڈکٹس دیکھ رہے ہیں، اس لیے آپ ہماری آفیشل ویب سائٹ سے براہ راست خریداری کر سکتے ہیں۔\n\n🌐 *ویب سائٹ:* https://rnvalves.com\n\nمین مینو کے لیے *Main Menu* یا *Hi* لکھیں۔`;
          } else if (lang === "hi") {
            pMsg = `चूँकि आप व्यक्तिगत उपयोग (Personal Use) के लिए उत्पाद ढूंढ रहे हैं, आप हमारी आधिकारिक वेबसाइट से सीधे उत्पाद देख और खरीद सकते हैं।\n\n🌐 *वेबसाइट:* https://rnvalves.com\n\nमुख्य मेन्यू पर वापस जाने के लिए कभी भी *Main Menu* या *Hi* लिखें।`;
          } else {
            pMsg = `Since you are looking for products for personal use, you can explore and purchase directly from our official website.\n\n🌐 *Visit Website:* https://rnvalves.com\n\nTo return to the main menu anytime, type *Main Menu* or *Hi*.`;
          }
          return { replyText: pMsg };
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

        const lang = session.language;
        let ecommAck = "";
        if (lang === "pa") {
          ecommAck = `✅ *ਧੰਨਵਾਦ!* ਤੁਹਾਡਾ ਸੁਨੇਹਾ ਸਾਡੇ ਈ-ਕਾਮਰਸ ਐਗਜ਼ੀਕਿਊਟਿਵ (*+91 93156 03920*) ਨੂੰ ਭੇਜ ਦਿੱਤਾ ਗਿਆ ਹੈ।\n\nਉਹ ਤੁਹਾਡੇ ਆਰਡਰ ਦਾ ਸਟੇਟਸ ਚੈੱਕ ਕਰਕੇ ਜਲਦੀ ਹੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਨਗੇ।\n\n🌐 *ਸਟੋਰ:* https://rnvalves.com\n\n1. 🏠 Main Menu`;
        } else if (lang === "te") {
          ecommAck = `✅ *ధన్యవాదాలు!* మీ సందేశం మా ఇ-కామర్స్ ఎగ్జిక్యూటివ్‌కు (*+91 93156 03920*) పంపబడింది.\n\nవారు మీ ఆర్డర్ స్థితిని సమీక్షించి త్వరలోనే మిమ్మల్ని సంప్రదిస్తారు.\n\n🌐 *స్టోర్:* https://rnvalves.com\n\n1. 🏠 Main Menu`;
        } else if (lang === "ta") {
          ecommAck = `✅ *நன்றி!* உங்கள் செய்தி எங்கள் இ-காமர்ஸ் நிர்வாகிக்கு (*+91 93156 03920*) அனுப்பப்பட்டுள்ளது.\n\nஅவர்கள் உங்கள் ஆர்டர் நிலையை சரிபார்த்து விரைவில் உங்களை தொடர்பு கொள்வார்கள்.\n\n🌐 *ஸ்டோர்:* https://rnvalves.com\n\n1. 🏠 Main Menu`;
        } else if (lang === "ur") {
          ecommAck = `✅ *شکریہ!* آپ کا پیغام ہمارے ای کامرس ایگزیکٹو (*+91 93156 03920*) کو پہنچا دیا گیا ہے۔\n\nوہ آپ کے آرڈر کی جانچ کر کے جلد آپ سے رابطہ کریں گے۔\n\n🌐 *اسٹور:* https://rnvalves.com\n\n1. 🏠 Main Menu`;
        } else if (lang === "hi") {
          ecommAck = `✅ *धन्यवाद!* आपका संदेश हमारे ई-कॉमर्स एग्जीक्यूटिव (*+91 93156 03920*) को भेज दिया गया है।\n\nवे आपके ऑर्डर की स्थिति जाँचकर अतिशीघ्र आपसे संपर्क करेंगे।\n\n🌐 *आधिकारिक स्टोर:* https://rnvalves.com\n\n1. 🏠 Main Menu`;
        } else {
          ecommAck = `✅ *Thank you!* Your message has been forwarded directly to our E-Commerce Executive (*+91 93156 03920*).\n\nOur team will review your order status and connect with you shortly.\n\n🌐 *Official Store:* https://rnvalves.com\n\n1. 🏠 Main Menu`;
        }

        return { replyText: ecommAck };
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
          session.state = "SALES_PIN_CODE";
          const lang = session.language;
          let pricingMsg = "";
          if (lang === "pa") {
            pricingMsg =
              `🔍 *ਕੀਮਤ ਅਤੇ ਉਤਪਾਦ ਖੋਜ (Pricing & Product Search)*\n\n` +
              `1️⃣ *ਕਿਸੇ ਖਾਸ ਉਤਪਾਦ ਦਾ ਰੇਟ ਅਤੇ ਫੋਟੋ ਦੇਖਣ ਲਈ:*\n` +
              `👉 ਸਿੱਧਾ ਉਤਪਾਦ ਦਾ *Item Code / SKU* (ਜਿਵੇਂ: *RNALP28G15* ਜਾਂ *RN-102*) ਲਿਖ ਕੇ ਭੇਜੋ!\n\n` +
              `2️⃣ *ਥੋਕ ਡੀਲਰ ਰੇਟਾਂ ਅਤੇ ਸੇਲਜ਼ ਮੈਨੇਜਰ ਨਾਲ ਗੱਲ ਕਰਨ ਲਈ:*\n` +
              `👉 ਆਪਣੇ ਖੇਤਰ ਦਾ *6-ਅੰਕੀ ਪਿਨ ਕੋਡ* (ਜਿਵੇਂ: *141001*) ਭੇਜੋ।\n\n` +
              `(ਮੁੱਖ ਮੇਨੂ ਲਈ *Menu* ਲਿਖੋ)`;
          } else if (lang === "te") {
            pricingMsg =
              `🔍 *ధరలు మరియు ఉత్పత్తి శోధన (Pricing & Product Search)*\n\n` +
              `1️⃣ *నిర్దిష్ట ఉత్పత్తి ధర మరియు ఫోటో చూడటానికి:*\n` +
              `👉 నేరుగా ఉత్పత్తి యొక్క *Item Code / SKU* (ఉదా: *RNALP28G15* లేదా *RN-102*) పంపండి!\n\n` +
              `2️⃣ *హోల్‌సేల్ డీలర్ ధరలు మరియు సేల్స్ మేనేజర్ సంప్రదింపు కోసం:*\n` +
              `👉 మీ ప్రాంతం యొక్క *6-అంకెల పిన్ కోడ్* (ఉదా: *500001*) పంపండి.\n\n` +
              `(ప్రధాన మెనూ కోసం *Menu* అని పంపండి)`;
          } else if (lang === "ta") {
            pricingMsg =
              `🔍 *விலை மற்றும் தயாரிப்பு தேடல் (Pricing & Product Search)*\n\n` +
              `1️⃣ *குறிப்பிட்ட தயாரிப்பின் விலை மற்றும் புகைப்படத்தை பார்க்க:*\n` +
              `👉 தயாரிப்பின் *Item Code / SKU* (எ.கா: *RNALP28G15* அல்லது *RN-102*) நேரடியாக அனுப்பவும்!\n\n` +
              `2️⃣ *மொத்த டீலர் விலைகள் மற்றும் விற்பனை மேலாளரை தொடர்பு கொள்ள:*\n` +
              `👉 உங்கள் பகுதியின் *6-இலக்க பின் குறியீட்டை* (எ.கா: *600001*) அனுப்பவும்.\n\n` +
              `(முதன்மை மெனுவுக்கு *Menu* என அனுப்பவும்)`;
          } else if (lang === "ur") {
            pricingMsg =
              `🔍 *قیمت اور پروڈکٹ تلاش (Pricing & Product Search)*\n\n` +
              `1️⃣ *کسی خاص پروڈکٹ کی قیمت اور تصویر دیکھنے کے لیے:*\n` +
              `👉 براہ راست پروڈکٹ کا *Item Code / SKU* (مثال: *RNALP28G15* یا *RN-102*) لکھ کر بھیجیں!\n\n` +
              `2️⃣ *تھوک ڈیلر ریٹس اور سیلز مینیجر سے رابطہ کے لیے:*\n` +
              `👉 اپنے علاقے کا *6 ہندسوں کا پن کوڈ* (مثال: *110001*) بھیجیں۔\n\n` +
              `(مین مینو کے لیے *Menu* لکھیں)`;
          } else if (lang === "hi") {
            pricingMsg =
              `🔍 *मूल्य व उत्पाद पूछताछ (Pricing & Product Search)*\n\n` +
              `1️⃣ *किसी ख़ास उत्पाद का रेट व फोटो देखना हो:*\n` +
              `👉 सीधे उत्पाद का *Item Code / SKU* (जैसे: *RNALP28G15* या *RN-102*) या नाम लिखकर भेजें!\n\n` +
              `2️⃣ *थोक डीलर रेट्स व सेल्स टीम से बात करनी हो:*\n` +
              `👉 अपने क्षेत्र का *6-अंकीय एरिया पिन कोड* (जैसे: *110001*) भेजें।\n\n` +
              `(वापस जाने के लिए *Menu* लिखें)`;
          } else {
            pricingMsg =
              `🔍 *Pricing & Product Search*\n\n` +
              `1️⃣ *To view instant price, specs & photo of any product:*\n` +
              `👉 Simply send the *Item Code / SKU* (e.g. *RNALP28G15* or *RN-102*) or name!\n\n` +
              `2️⃣ *For wholesale dealer pricing & sales manager connection:*\n` +
              `👉 Send your *6-digit Area PIN Code* (e.g. *110001*).\n\n` +
              `(Type *Menu* to go back)`;
          }
          return { replyText: pricingMsg };
        }

        if (cleanChoice === "3" || norm.includes("submit") || norm.includes("requirement")) {
          session.state = "FORM_NAME";
          const lang = session.language;
          let nameMsg = "";
          if (lang === "pa") {
            nameMsg = `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਜਾਂ ਦੁਕਾਨ/ਫਰਮ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ:\n(ਉਦਾਹਰਣ: ਸ਼ਰਮਾ ਸੈਨੇਟਰੀ ਸਟੋਰ ਜਾਂ ਰਾਹੁਲ ਗੁਪਤਾ)`;
          } else if (lang === "te") {
            nameMsg = `దయచేసి మీ పూర్తి పేరు లేదా దుకాణం/సంస్థ పేరును నమోదు చేయండి:\n(ఉదాహరణ: శర్మ శానిటరీ స్టోర్స్ లేదా రాహుల్ గుప్తా)`;
          } else if (lang === "ta") {
            nameMsg = `தயவுசெய்து உங்கள் முழு பெயர் அல்லது கடை/நிறுவனத்தின் பெயரை உள்ளிடவும்:\n(எடுத்துக்காட்டு: ஷர்மா சானிட்டரி ஸ்டோர் அல்லது ராகுல் குப்தா)`;
          } else if (lang === "ur") {
            nameMsg = `براہ کرم اپنا پورا نام یا دکان/فرم کا نام درج کریں:\n(مثال: شرما سینیٹری اسٹور یا راہول گپتا)`;
          } else if (lang === "hi") {
            nameMsg = `कृपया अपना पूरा नाम या दुकान/फर्म का नाम दर्ज करें:\n(उदाहरण: Sharma Sanitary Store या Rahul Gupta)`;
          } else {
            nameMsg = `Please enter your Full Name or Firm/Shop Name:\n(Example: Sharma Sanitary Store or Rahul Gupta)`;
          }
          return { replyText: nameMsg };
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
        const lang = session.language;

        let textResponse = "";
        if (lang === "pa") {
          textResponse = `📄 *${category.name}* ਕੈਟਾਲਾਗ PDF:\n${category.pdfUrl}\n\nਤੁਸੀਂ ਅੱਗੇ ਕੀ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;
        } else if (lang === "te") {
          textResponse = `📄 *${category.name}* కేటలాగ్ PDF:\n${category.pdfUrl}\n\nమీరు ముందుకు ఎలా కొనసాగాలనుకుంటున్నారు?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;
        } else if (lang === "ta") {
          textResponse = `📄 *${category.name}* பட்டியல் PDF:\n${category.pdfUrl}\n\nநீங்கள் அடுத்து என்ன செய்ய விரும்புகிறீர்கள்?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;
        } else if (lang === "ur") {
          textResponse = `📄 *${category.name}* کیٹلاگ PDF:\n${category.pdfUrl}\n\nآپ آگے کیا کرنا چاہتے ہیں؟\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;
        } else if (lang === "hi") {
          textResponse = `📄 *${category.name}* का कैटलॉग पीडीएफ:\n${category.pdfUrl}\n\nआप आगे क्या करना चाहेंगे?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;
        } else {
          textResponse = `📄 Here is the official *${category.name}* Catalogue PDF:\n${category.pdfUrl}\n\nHow would you like to proceed?\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📂 View Other Categories\n4. 🏠 Main Menu`;
        }

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
          const lang = session.language;
          let pinMsg = "";
          if (lang === "pa") {
            pinMsg = `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਖੇਤਰ ਦਾ 6-ਅੰਕੀ ਪਿਨ ਕੋਡ (Area PIN Code) ਦਰਜ ਕਰੋ:`;
          } else if (lang === "te") {
            pinMsg = `దయచేసి మీ ప్రాంతం యొక్క 6-అంకెల పిన్ కోడ్ (Area PIN Code) నమోదు చేయండి:`;
          } else if (lang === "ta") {
            pinMsg = `தயவுசெய்து உங்கள் 6-இலக்க பகுதி பின் குறியீட்டை (Area PIN Code) உள்ளிடவும்:`;
          } else if (lang === "ur") {
            pinMsg = `براہ کرم اپنے علاقے کا 6 ہندسوں کا پن کوڈ درج کریں:`;
          } else if (lang === "hi") {
            pinMsg = `कृपया अपने क्षेत्र का 6-अंकीय एरिया पिन कोड (Area PIN Code) दर्ज करें:`;
          } else {
            pinMsg = `Please enter your 6-digit Area PIN Code:`;
          }
          return { replyText: pinMsg };
        }

        if (cleanChoice === "2" || norm.includes("submit")) {
          session.state = "FORM_NAME";
          const lang = session.language;
          let nameMsg = "";
          if (lang === "pa") {
            nameMsg = `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਦਰਜ ਕਰੋ:`;
          } else if (lang === "te") {
            nameMsg = `దయచేసి మీ పూర్తి పేరు నమోదు చేయండి:`;
          } else if (lang === "ta") {
            nameMsg = `தயவுசெய்து உங்கள் முழு பெயரை உள்ளிடவும்:`;
          } else if (lang === "ur") {
            nameMsg = `براہ کرم اپنا پورا نام درج کریں:`;
          } else if (lang === "hi") {
            nameMsg = `कृपया अपना पूरा नाम दर्ज करें:`;
          } else {
            nameMsg = `Please enter your Full Name:`;
          }
          return { replyText: nameMsg };
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
          const lang = session.language;
          let pinErr = "";
          if (lang === "pa") {
            pinErr = `⚠️ ਕਿਰਪਾ ਕਰਕੇ 6 ਅੰਕਾਂ ਦਾ ਪ੍ਰਮਾਣਿਕ ਭਾਰਤੀ ਪਿਨ ਕੋਡ ਦਰਜ ਕਰੋ। ਉਦਾਹਰਣ: 110001\n(ਮੇਨੂ ਲਈ *Menu* ਲਿਖੋ)`;
          } else if (lang === "te") {
            pinErr = `⚠️ దయచేసి సరైన 6-అంకెల భారతీయ పిన్ కోడ్ నమోదు చేయండి. ఉదాహరణ: 500001\n(మెనూ కోసం *Menu* అని పంపండి)`;
          } else if (lang === "ta") {
            pinErr = `⚠️ சரியான 6-இலக்க இந்திய பின் குறியீட்டை உள்ளிடவும். எடுத்துக்காட்டு: 600001\n(மெனுவுக்கு *Menu* என அனுப்பவும்)`;
          } else if (lang === "ur") {
            pinErr = `⚠️ براہ کرم درست 6 ہندسوں کا ہندوستانی پن کوڈ درج کریں۔ مثال: 110001\n(مینو کے لیے *Menu* لکھیں)`;
          } else if (lang === "hi") {
            pinErr = `⚠️ कृपया 6 अंकों का मान्य भारतीय पिन कोड दर्ज करें। उदाहरण: 110001\n(मेन्यू पर वापस जाने के लिए *Menu* लिखें)`;
          } else {
            pinErr = `⚠️ Please enter a valid 6-digit Indian PIN Code. Example: 110001\n(Type *Menu* to return to main menu)`;
          }
          return { replyText: pinErr };
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
          const lang = session.language;
          let nameMsg = "";
          if (lang === "pa") {
            nameMsg = `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਜਾਂ ਦੁਕਾਨ/ਫਰਮ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ:\n(ਉਦਾਹਰਣ: ਆਦਿਤਿਆ ਐਂਟਰਪ੍ਰਾਈਜਿਜ਼ ਜਾਂ ਸੁਮਿਤ ਕੁਮਾਰ)`;
          } else if (lang === "te") {
            nameMsg = `దయచేసి మీ పూర్తి పేరు లేదా దుకాణం/సంస్థ పేరును నమోదు చేయండి:\n(ఉదాహరణ: ఆదిత్య ఎంటర్‌ప్రైజెస్ లేదా సుమిత్ కుమార్)`;
          } else if (lang === "ta") {
            nameMsg = `தயவுசெய்து உங்கள் முழு பெயர் அல்லது கடை/நிறுவனத்தின் பெயரை உள்ளிடவும்:\n(எடுத்துக்காட்டு: ஆதித்யா எண்டர்பிரைசஸ் அல்லது சுமித் குமார்)`;
          } else if (lang === "ur") {
            nameMsg = `براہ کرم اپنا پورا نام یا دکان/فرم کا نام درج کریں:\n(مثال: آدتیہ انٹرپرائزز یا سمیت کمار)`;
          } else if (lang === "hi") {
            nameMsg = `कृपया अपना पूरा नाम या दुकान/फर्म का नाम दर्ज करें:\n(उदाहरण: Aditya Enterprises या Sumit Kumar)`;
          } else {
            nameMsg = `Please enter your Full Name or Firm/Shop Name:\n(Example: Aditya Enterprises or Sumit Kumar)`;
          }
          return { replyText: nameMsg };
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

        const raw = text.trim();
        // Check for off-topic questions (discount, price, rate, kaun, etc.) -> Offer Human Takeover
        if (/\b(kaun|kyu|kyun|discount|price|rate|kya|who|why|help|agent|human|talk|baat)\b/i.test(raw)) {
          session.state = "HUMAN_TAKEOVER_PROMPT";
          return this.renderHumanTakeoverPrompt(session.language);
        }

        const cleanName = FlowEngine.sanitizeAndExtractName(raw);

        // Validation: Must not be purely digits, at least 2 chars, not dummy filler
        const invalidFillers = /^(hi|hello|hey|ok|okay|yes|no|haan|nahi|menu|test|demo|name|naam|bye|good|bad|nice)$/i;
        if (cleanName.length < 2 || cleanName.length > 60 || /^\d+$/.test(cleanName) || /[@$%^*_+=\[\]{}|\\<>~`]/g.test(cleanName) || invalidFillers.test(cleanName) || /^(.)\1{3,}$/.test(cleanName)) {
          const lang = session.language;
          let retryPrompt = "";
          if (lang === "pa") {
            retryPrompt = `⚠️ ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਅਸਲ ਨਾਮ ਜਾਂ ਦੁਕਾਨ/ਫਰਮ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ:\n(ਉਦਾਹਰਣ: Sharma Sanitary Store ਜਾਂ Rahul Gupta)`;
          } else if (lang === "te") {
            retryPrompt = `⚠️ దయచేసి మీ సరైన పేరు లేదా దుకాణం/సంస్థ పేరును నమోదు చేయండి:\n(ఉదాహరణ: Sharma Sanitary Store లేదా Rahul Gupta)`;
          } else if (lang === "ta") {
            retryPrompt = `⚠️ தயவுசெய்து உங்கள் சரியான பெயர் அல்லது கடை/நிறுவனத்தின் பெயரை உள்ளிடவும்:\n(எடுத்துக்காட்டு: Sharma Sanitary Store அல்லது Rahul Gupta)`;
          } else if (lang === "ur") {
            retryPrompt = `⚠️ براہ کرم اپنا درست نام یا دکان/فرم کا نام درج کریں:\n(مثال: Sharma Sanitary Store یا Rahul Gupta)`;
          } else if (lang === "hi") {
            retryPrompt = `⚠️ कृपया अपना सही नाम या दुकान/फर्म का नाम दर्ज करें:\n(उदाहरण: Sharma Sanitary Store या Rahul Gupta)`;
          } else {
            retryPrompt = `⚠️ Please enter a valid Name or Shop/Firm Name:\n(Example: Sharma Sanitary Store or Rahul Gupta)`;
          }
          return { replyText: retryPrompt };
        }

        session.formData.name = cleanName;
        // Check if an explicit mobile number was included
        const phoneMatch = raw.match(/\b([6-9]\d{9})\b/);
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
          const lang = session.language;
          let mobErr = "";
          if (lang === "pa") {
            mobErr = `⚠️ ਕਿਰਪਾ ਕਰਕੇ 10 ਅੰਕਾਂ ਦਾ ਪ੍ਰਮਾਣਿਕ ਭਾਰਤੀ ਮੋਬਾਈਲ ਨੰਬਰ ਦਰਜ ਕਰੋ (6, 7, 8 ਜਾਂ 9 ਨਾਲ ਸ਼ੁਰੂ ਹੋਣ ਵਾਲਾ)।\nਉਦਾਹਰਣ: 9876543210`;
          } else if (lang === "te") {
            mobErr = `⚠️ దయచేసి సరైన 10-అంకెల భారతీయ మొబైల్ నంబర్ నమోదు చేయండి (6, 7, 8 లేదా 9 తో ప్రారంభమయ్యేది).\nఉదాహరణ: 9876543210`;
          } else if (lang === "ta") {
            mobErr = `⚠️ சரியான 10-இலக்க இந்திய கைபேசி எண்ணை உள்ளிடவும் (6, 7, 8 அல்லது 9 இல் தொடங்குவது).\nஎடுத்துக்காட்டு: 9876543210`;
          } else if (lang === "ur") {
            mobErr = `⚠️ براہ کرم درست 10 ہندسوں کا ہندوستانی موبائل نمبر درج کریں (6, 7, 8 یا 9 سے شروع ہونے والا)۔\nمثال: 9876543210`;
          } else if (lang === "hi") {
            mobErr = `⚠️ कृपया 10 अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें (6, 7, 8 या 9 से शुरू होने वाला)।\nउदाहरण: 9876543210`;
          } else {
            mobErr = `⚠️ Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9).\nExample: 9876543210`;
          }
          return { replyText: mobErr };
        }

        session.formData.mobile = cleanMobile;
        session.state = "FORM_PIN";
        const lang = session.language;
        let pinPrompt = "";
        if (lang === "pa") {
          pinPrompt = `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਖੇਤਰ ਦਾ 6-ਅੰਕੀ ਪਿਨ ਕੋਡ (Area PIN Code) ਦਰਜ ਕਰੋ:`;
        } else if (lang === "te") {
          pinPrompt = `దయచేసి మీ ప్రాంతం యొక్క 6-అంకెల పిన్ కోడ్ (Area PIN Code) నమోదు చేయండి:`;
        } else if (lang === "ta") {
          pinPrompt = `தயவுசெய்து உங்கள் 6-இலக்க பகுதி பின் குறியீட்டை (Area PIN Code) உள்ளிடவும்:`;
        } else if (lang === "ur") {
          pinPrompt = `براہ کرم اپنے علاقے کا 6 ہندسوں کا پن کوڈ درج کریں:`;
        } else if (lang === "hi") {
          pinPrompt = `कृपया अपने क्षेत्र का 6-अंकीय पिन कोड (Area PIN Code) दर्ज करें:`;
        } else {
          pinPrompt = `Please enter your 6-digit Area PIN Code:`;
        }
        return { replyText: pinPrompt };
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

        const lang = session.language;
        let interestPrompt = "";
        if (lang === "pa") {
          interestPrompt = `ਤੁਸੀਂ ਕਿਸ ਉਤਪਾਦ ਸ਼੍ਰੇਣੀ (Product Category) ਵਿੱਚ ਦਿਲਚਸਪੀ ਰੱਖਦੇ ਹੋ?\n\n1. CP Faucets (ਬ੍ਰਾਸ ਨਲ)\n2. PTMT Faucets (ਪੀਟੀਐਮਟੀ ਨਲ)\n3. Accessories (ਬਾਥਰੂਮ ਐਕਸੈਸਰੀਜ਼)\n4. Health Faucets (ਹੈਲਥ ਫ਼ੌਸੇਟ)\n5. Showers (ਸ਼ਾਵਰ)\n6. Ball Valves (ਬਾਲ ਵਾਲਵ)\n7. All Categories (ਸੰਪੂਰਨ ਕੈਟਾਲਾਗ)\n\n(1 ਤੋਂ 7 ਵਿੱਚੋਂ ਇੱਕ ਨੰਬਰ ਭੇਜੋ)`;
        } else if (lang === "te") {
          interestPrompt = `మీరు ఏ ఉత్పత్తి విభాగం (Product Category) పై ఆసక్తి చూపుతున్నారు?\n\n1. CP Faucets (బ్రాస్ కుళాయిలు)\n2. PTMT Faucets (పీటీఎంటీ కుళాయిలు)\n3. Accessories (బాత్రూమ్ ఉపకరణాలు)\n4. Health Faucets (హెల్త్ ఫాసెట్స్)\n5. Showers (షవర్లు)\n6. Ball Valves (బాల్ వాల్వ్‌లు)\n7. All Categories (మొత్తం కేటలాగ్)\n\n(1 నుండి 7 వరకు ఒక నంబర్ పంపండి)`;
        } else if (lang === "ta") {
          interestPrompt = `நீங்கள் எந்த தயாரிப்பு பிரிவில் (Product Category) ஆர்வமாக உள்ளீர்கள்?\n\n1. CP Faucets (பித்தளை குழாய்கள்)\n2. PTMT Faucets (பிடிஎம்டி குழாய்கள்)\n3. Accessories (குளியலறை பாகங்கள்)\n4. Health Faucets (ஹெல்த் ஃபாகெட்ஸ்)\n5. Showers (ஷவர்கள்)\n6. Ball Valves (பால் வால்வுகள்)\n7. All Categories (முழு பட்டியல்)\n\n(1 முதல் 7 வரை ஒரு எண்ணை அனுப்பவும்)`;
        } else if (lang === "ur") {
          interestPrompt = `آپ کس پروڈکٹ کے زمرے (Product Category) میں دلچسپی رکھتے ہیں؟\n\n1. CP Faucets (پیتل کے نل)\n2. PTMT Faucets (پی ٹی ایم ٹی نل)\n3. Accessories (باتھ روم لوازمات)\n4. Health Faucets (ہیلتھ فاوسیٹس)\n5. Showers (شاورز)\n6. Ball Valves (بال والوز)\n7. All Categories (مکمل کیٹلاگ)\n\n(1 سے 7 میں سے انتخاب کریں)`;
        } else if (lang === "hi") {
          interestPrompt = `आप किस उत्पाद श्रेणी (Product Category) में रुचि रखते हैं?\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 से 7 में से एक नंबर भेजें)`;
        } else {
          interestPrompt = `Which product category are you interested in?\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(Reply with 1 to 7)`;
        }

        return { replyText: interestPrompt };
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

        // Check if this customer / phone number already has prior inquiries in CRM
        let existingLead: any = null;
        try {
          existingLead = await Lead.findOne({
            phone: { $in: [leadPhone, formattedLeadPhone, cleanLeadDigits, `+${cleanLeadDigits}`] },
          }).sort({ createdAt: -1 });
        } catch (findErr: any) {
          console.warn(`[FlowEngine] Lead duplicate check notice: ${findErr.message}`);
        }

        const isRepeat = Boolean(existingLead);
        const requirementDescription = isRepeat
          ? `🔄 [Repeat Enquiry]: Interested in ${interestName}. (Previous Lead: ${existingLead?.leadNumber} - ${existingLead?.status || "OPEN"}). Pincode: ${session.formData.pincode}`
          : `WhatsApp Lead: Interested in ${interestName}. Pincode: ${session.formData.pincode}`;

        const internalNotes = isRepeat
          ? [
              `Repeat inquiry from existing customer (+${cleanLeadDigits}). Previous Lead ${existingLead?.leadNumber} (${existingLead?.status}) was assigned to ${existingLead?.assignedEmployeeName || rep.name}.`,
              `New inquiry for ${interestName} assigned to ${rep.name} (${rep.mobile}) for ${rep.state} region via WhatsApp Bot.`,
            ]
          : [`Assigned to ${rep.name} (${rep.mobile}) for ${rep.state} region via WhatsApp Bot`];

        try {
          await Lead.create({
            leadNumber,
            customerName: session.formData.name || customerName || (existingLead ? existingLead.customerName : "Customer"),
            phone: formattedLeadPhone,
            businessType: session.customerType || "Dealer",
            city: rep.state,
            state: rep.state,
            productCategory: interestName,
            productInterest: [interestName],
            requirementDescription,
            leadSource: "WhatsApp_Inbound",
            assignedEmployeeName: rep.name,
            status: "NEW",
            priority: isRepeat ? "URGENT" : "HIGH",
            internalNotes,
          });
          console.log(`✅ [FlowEngine] Created Lead ${leadNumber} (${isRepeat ? "REPEAT" : "NEW"}) for ${session.formData.name} -> Assigned to ${rep.name}`);
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
                name: session.formData.name || customerName || (existingLead ? existingLead.customerName : "Customer"),
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
            isRepeat,
            previousLeadNumber: existingLead?.leadNumber,
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
        } else if (lang === "te") {
          finalMsg = `🎉 *ధన్యవాదాలు ${session.formData.name}!* మీ అవసరం విజయవంతంగా నమోదు చేయబడింది.\n\n`;
          finalMsg += `📋 *మీ వివరాలు:*\n`;
          finalMsg += `• పేరు: ${session.formData.name}\n`;
          finalMsg += `• మొబైల్: +${custPhone}\n`;
          finalMsg += `• పిన్ కోడ్: ${session.formData.pincode} (${rep.state})\n`;
          finalMsg += `• వర్గం: ${session.customerType || "Dealer"}\n`;
          finalMsg += `• ఉత్పత్తి ఆసక్తి: ${interestName}\n\n`;
          finalMsg += `👤 *మీ ప్రాంతీయ సేల్స్ మేనేజర్ (Regional Sales Manager):*\n`;
          finalMsg += `• పేరు: *${rep.name}*\n`;
          finalMsg += `• మొబైల్: *${rep.mobile}*\n`;
          finalMsg += `• ప్రాంతం: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `మా సేల్స్ బృందం ప్రత్యేక డీలర్ ధరలతో త్వరలోనే మిమ్మల్ని సంప్రదిస్తుంది.\n\n`;
          finalMsg += `━━━━━━━━━━━━━━━━━━━\n`;
          finalMsg += `*మీరు తదుపరి ఏమి చూడాలనుకుంటున్నారు? (What would you like to explore next?)*\n\n`;
          finalMsg += `1. 👤 Talk to Sales Team (సేల్స్ టీమ్‌తో మాట్లాడండి)\n`;
          finalMsg += `2. 📝 Submit Requirement (మరో అవసరాన్ని నమోదు చేయండి)\n`;
          finalMsg += `3. 📄 View Other Catalogues (ఇతర కేటలాగ్‌లు చూడండి)\n`;
          finalMsg += `4. 📞 Customer Care & Support (కస్టమర్ కేర్ & ఫిర్యాదులు)\n`;
          finalMsg += `5. 🌐 Visit Official Website (వెబ్‌సైట్ చూడండి - rnvalves.com)\n`;
          finalMsg += `6. 🏠 Main Menu (ప్రధాన మెనూ)\n\n`;
          finalMsg += `(1 నుండి 6 వరకు ఒక నంబర్ పంపండి)`;
        } else if (lang === "ta") {
          finalMsg = `🎉 *நன்றி ${session.formData.name}!* உங்கள் தேவை வெற்றிகரமாக பதிவு செய்யப்பட்டது.\n\n`;
          finalMsg += `📋 *உங்கள் விவரங்கள்:*\n`;
          finalMsg += `• பெயர்: ${session.formData.name}\n`;
          finalMsg += `• கைபேசி: +${custPhone}\n`;
          finalMsg += `• பின் குறியீடு: ${session.formData.pincode} (${rep.state})\n`;
          finalMsg += `• வகை: ${session.customerType || "Dealer"}\n`;
          finalMsg += `• தயாரிப்பு: ${interestName}\n\n`;
          finalMsg += `👤 *உங்கள் பிராந்திய விற்பனை மேலாளர் (Regional Sales Manager):*\n`;
          finalMsg += `• பெயர்: *${rep.name}*\n`;
          finalMsg += `• கைபேசி: *${rep.mobile}*\n`;
          finalMsg += `• பகுதி: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `எங்கள் விற்பனை குழு சிறப்பு டீலர் விலைகளுடன் விரைவில் உங்களை தொடர்பு கொள்ளும்.\n\n`;
          finalMsg += `━━━━━━━━━━━━━━━━━━━\n`;
          finalMsg += `*அடுத்து நீங்கள் என்ன பார்க்க விரும்புகிறீர்கள்? (What would you like to explore next?)*\n\n`;
          finalMsg += `1. 👤 Talk to Sales Team (விற்பனை குழுவுடன் பேசுங்கள்)\n`;
          finalMsg += `2. 📝 Submit Requirement (கூடுதல் தேவையை பதிவு செய்ய)\n`;
          finalMsg += `3. 📄 View Other Catalogues (மற்ற அட்டவணைகளை பார்க்க)\n`;
          finalMsg += `4. 📞 Customer Care & Support (வாடிக்கையாளர் சேவை & புகார்)\n`;
          finalMsg += `5. 🌐 Visit Official Website (இணையதளத்தைப் பார்வையிடவும் - rnvalves.com)\n`;
          finalMsg += `6. 🏠 Main Menu (முதன்மை மெனு)\n\n`;
          finalMsg += `(1 முதல் 6 வரை ஒரு எண்ணை அனுப்பவும்)`;
        } else if (lang === "ur") {
          finalMsg = `🎉 *شکریہ ${session.formData.name}!* آپ کی ضرورت کامیابی کے ساتھ درج کر لی گئی ہے۔\n\n`;
          finalMsg += `📋 *آپ کی تفصیلات:*\n`;
          finalMsg += `• نام: ${session.formData.name}\n`;
          finalMsg += `• موبائل: +${custPhone}\n`;
          finalMsg += `• پن کوڈ: ${session.formData.pincode} (${rep.state})\n`;
          finalMsg += `• زمرہ: ${session.customerType || "Dealer"}\n`;
          finalMsg += `• پروڈکٹ دلچسپی: ${interestName}\n\n`;
          finalMsg += `👤 *آپ کے علاقائی سیلز مینیجر (Regional Sales Manager):*\n`;
          finalMsg += `• نام: *${rep.name}*\n`;
          finalMsg += `• موبائل: *${rep.mobile}*\n`;
          finalMsg += `• علاقہ: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `ہماری سیلز ٹیم خصوصی ڈیلر قیمتوں کے ساتھ جلد آپ سے رابطہ کرے گی۔\n\n`;
          finalMsg += `━━━━━━━━━━━━━━━━━━━\n`;
          finalMsg += `*آپ آگے کیا دیکھنا چاہتے ہیں؟ (What would you like to explore next?)*\n\n`;
          finalMsg += `1. 👤 Talk to Sales Team (سیلز ٹیم سے بات کریں)\n`;
          finalMsg += `2. 📝 Submit Requirement (اضافی ضرورت درج کریں)\n`;
          finalMsg += `3. 📄 View Other Catalogues (دیگر کیٹلاگ دیکھیں)\n`;
          finalMsg += `4. 📞 Customer Care & Support (کسٹمر کیئر و شکایات)\n`;
          finalMsg += `5. 🌐 Visit Official Website (آفیشل ویب سائٹ - rnvalves.com)\n`;
          finalMsg += `6. 🏠 Main Menu (مین مینو)\n\n`;
          finalMsg += `(1 سے 6 میں سے ایک نمبر بھیجیں)`;
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
          const lang = session.language;
          let reqPrompt = "";
          if (lang === "pa") {
            reqPrompt = `📝 *ਨਵੀਂ ਲੋੜ / ਪੁੱਛਗਿੱਛ ਦਰਜ ਕਰੋ*\n\nਕਿਰਪਾ ਕਰਕੇ ਦੱਸੋ ਕਿ ਤੁਸੀਂ ਕਿਸ ਉਤਪਾਦ ਸ਼੍ਰੇਣੀ ਜਾਂ ਮਾਡਲ ਵਿੱਚ ਦਿਲਚਸਪੀ ਰੱਖਦੇ ਹੋ:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 ਤੋਂ 7 ਵਿੱਚੋਂ ਇੱਕ ਨੰਬਰ ਭੇਜੋ)`;
          } else if (lang === "te") {
            reqPrompt = `📝 *కొత్త అవసరం / విచారణను సమర్పించండి*\n\nదయచేసి మీరు ఏ ఉత్పత్తి విభాగం లేదా మోడల్‌పై ఆసక్తి చూపుతున్నారో ఎంచుకోండి:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 నుండి 7 వరకు ఒక నంబర్ పంపండి)`;
          } else if (lang === "ta") {
            reqPrompt = `📝 *புதிய தேவை / விசாரணையை சமர்ப்பிக்கவும்*\n\nநீங்கள் விரும்பும் தயாரிப்பு வகையை தேர்ந்தெடுக்கவும்:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 முதல் 7 வரை ஒரு எண்ணை அனுப்பவும்)`;
          } else if (lang === "ur") {
            reqPrompt = `📝 *نئی ضرورت / پوچھ گچھ درج کریں*\n\nبراہ کرم منتخب کریں کہ آپ کس پروڈکٹ کے زمرے میں دلچسپی رکھتے ہیں:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 سے 7 میں سے ایک نمبر بھیجیں)`;
          } else if (lang === "hi") {
            reqPrompt = `📝 *नई आवश्यकता / पूछताछ दर्ज करें*\n\nकृपया बताएं कि आप किस उत्पाद श्रेणी (Product Category) या मॉडल में रुचि रखते हैं:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(1 से 7 में से एक नंबर भेजें या सीधे आइटम कोड लिखें)`;
          } else {
            reqPrompt = `📝 *Submit Requirement / Inquiry*\n\nPlease select the product category or item you are interested in:\n\n1. CP Faucets\n2. PTMT Faucets\n3. Accessories\n4. Health Faucets\n5. Showers\n6. Ball Valves\n7. All Categories\n\n(Reply with 1 to 7 or send item codes directly)`;
          }
          return { replyText: reqPrompt };
        }

        if (cleanChoice === "3" || norm.includes("catalog") || norm.includes("other") || norm.includes("category")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (cleanChoice === "4" || norm.includes("care") || norm.includes("complaint") || norm.includes("support") || norm.includes("shikayat") || norm.includes("service")) {
          return this.renderCustomerCareCard(session.language);
        }

        if (cleanChoice === "5" || norm.includes("website") || norm.includes("site") || norm.includes("online")) {
          const lang = session.language;
          let siteMsg = "";
          if (lang === "pa") {
            siteMsg = `🌐 *RN Valves & Faucets ਅਧਿਕਾਰਤ ਵੈੱਬਸਾਈਟ:*\nhttps://rnvalves.com\n\nਇੱਥੇ ਤੁਸੀਂ ਸਾਡੇ 200+ ਪ੍ਰੀਮੀਅਮ ਬ੍ਰਾਸ ਅਤੇ PTMT ਉਤਪਾਦ ਅਤੇ ਵਾਰੰਟੀ ਦੇਖ ਸਕਦੇ ਹੋ।\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`;
          } else if (lang === "te") {
            siteMsg = `🌐 *RN Valves & Faucets అధికారిక వెబ్‌సైట్:*\nhttps://rnvalves.com\n\nఇక్కడ మీరు మా 200+ ప్రీమియం బ్రాస్ & PTMT ఉత్పత్తులు మరియు వారంటీలను పరిశీలించవచ్చు.\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`;
          } else if (lang === "ta") {
            siteMsg = `🌐 *RN Valves & Faucets அதிகாரப்பூர்வ வலைத்தளம்:*\nhttps://rnvalves.com\n\nஇங்கே எங்கள் 200+ பிரீமியம் பித்தளை & PTMT தயாரிப்புகளை பார்க்கலாம்.\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`;
          } else if (lang === "ur") {
            siteMsg = `🌐 *RN Valves & Faucets آفیشل ویب سائٹ:*\nhttps://rnvalves.com\n\nیہاں آپ ہمارے 200+ پریمیم براس اور PTMT مصنوعات دیکھ سکتے ہیں۔\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`;
          } else if (lang === "hi") {
            siteMsg = `🌐 *RN Valves & Faucets आधिकारिक वेबसाइट:*\nhttps://rnvalves.com\n\nयहाँ आप हमारे 200+ प्रीमियम ब्रास व PTMT उत्पाद, तकनीकी विवरण एवं वारंटी देख सकते हैं।\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`;
          } else {
            siteMsg = `🌐 *RN Valves & Faucets Official Website:*\nhttps://rnvalves.com\n\nExplore our full range of 200+ premium brass & PTMT faucets, technical specs & warranties.\n\n1. 👤 Talk to Sales Team\n2. 📝 Submit Requirement\n3. 📄 View Other Catalogues\n4. 📞 Customer Care & Support\n5. 🏠 Main Menu`;
          }
          return { replyText: siteMsg };
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

          const lang = session.language;
          let takeoverReply = "";
          if (lang === "pa") {
            takeoverReply =
              `✅ *ਹਿਊਮਨ ਟੇਕਓਵਰ ਐਕਟਿਵ (Human Takeover Activated)*\n\n` +
              `ਤੁਹਾਨੂੰ ਸਾਡੇ ਲਾਈਵ ਕਸਟਮਰ ਸਪੋਰਟ / ਸੇਲਜ਼ ਪ੍ਰਤੀਨਿਧੀ ਨਾਲ ਕਨੈਕਟ ਕਰ ਦਿੱਤਾ ਗਿਆ ਹੈ।\n\n` +
              `👨‍💼 ਸਾਡੇ ਪ੍ਰਤੀਨਿਧੀ ਜਲਦੀ ਹੀ ਇਸੇ ਚੈਟ 'ਤੇ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਨਗੇ।\n\n` +
              `☎️ *ਤੁਰੰਤ ਸਹਾਇਤਾ ਲਈ ਕਾਲ ਕਰੋ:* 1800 12340 0400 (ਟੋਲ-ਫ੍ਰੀ) ਜਾਂ +91 93151 60881\n\n` +
              `(ਬੋਟ ਨੂੰ ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਕਦੇ ਵੀ *#aion* ਜਾਂ *Menu* ਲਿਖੋ)`;
          } else if (lang === "te") {
            takeoverReply =
              `✅ *హ్యూమన్ టేకోవర్ యాక్టివేట్ చేయబడింది (Human Takeover Activated)*\n\n` +
              `మీరు మా లైవ్ కస్టమర్ సపోర్ట్ / సేల్స్ ప్రతినిధితో నేరుగా కనెక్ట్ చేయబడ్డారు.\n\n` +
              `👨‍💼 మా ప్రతినిధి అతి త్వరలో ఈ చాట్ ద్వారా మిమ్మల్ని సంప్రదిస్తారు.\n\n` +
              `☎️ *తక్షణ సహాయం కోసం కాల్ చేయండి:* 1800 12340 0400 (టోల్-ఫ్రీ) లేదా +91 93151 60881\n\n` +
              `(బాట్‌ను తిరిగి ప్రారంభించడానికి ఎప్పుడైనా *#aion* లేదా *Menu* అని టైప్ చేయండి)`;
          } else if (lang === "ta") {
            takeoverReply =
              `✅ *நேரடி உதவி செயல்படுத்தப்பட்டது (Human Takeover Activated)*\n\n` +
              `எங்கள் நேரடி வாடிக்கையாளர் சேவை / விற்பனை பிரதிநிதியுடன் இணைக்கப்பட்டுள்ளீர்கள்.\n\n` +
              `👨‍💼 எங்கள் பிரதிநிதி விரைவில் இந்த அரட்டையில் உங்களை தொடர்பு கொள்வார்.\n\n` +
              `☎️ *உடனடி உதவிக்கு அழைக்கவும்:* 1800 12340 0400 (கட்டணமில்லா எண்) அல்லது +91 93151 60881\n\n` +
              `(பாட்டை மீண்டும் இயக்க *#aion* அல்லது *Menu* என தட்டச்சு செய்யவும்)`;
          } else if (lang === "ur") {
            takeoverReply =
              `✅ *ہیومن ٹیک اوور ایکٹیو (Human Takeover Activated)*\n\n` +
              `آپ کو ہمارے لائیو کسٹمر سپورٹ / سیلز نمائندے سے منسلک کر دیا گیا ہے۔\n\n` +
              `👨‍💼 ہمارے نمائندے جلد ہی اسی چیٹ پر آپ سے براہ راست رابطہ کریں گے۔\n\n` +
              `☎️ *فوری مدد کے لیے کال کریں:* 1800 12340 0400 (ٹول فری) یا +91 93151 60881\n\n` +
              `(بوٹ دوبارہ شروع کرنے کے لیے کبھی بھی *#aion* یا *Menu* لکھیں)`;
          } else if (lang === "hi") {
            takeoverReply =
              `✅ *ह्यूमन टेकओवर एक्टिव (Human Takeover Activated)*\n\n` +
              `आपको हमारे लाइव कस्टमर सपोर्ट / सेल्स प्रतिनिधि से कनेक्ट कर दिया गया है।\n\n` +
              `👨‍💼 हमारे प्रतिनिधि अतिशीघ्र इसी चैट पर आपसे सीधे बात करेंगे।\n\n` +
              `☎️ *तत्काल सहायता के लिए कॉल करें:* 1800 12340 0400 (टोल-फ्री) या +91 93151 60881\n\n` +
              `(बॉट को दोबारा चालू करने के लिए कभी भी *#aion* या *Menu* लिखें)`;
          } else {
            takeoverReply =
              `✅ *Human Takeover Activated*\n\n` +
              `You have been connected directly with our Live Support / Sales Team.\n\n` +
              `👨‍💼 Our representative will reply to you on this chat shortly.\n\n` +
              `☎️ *For immediate assistance, call:* 1800 12340 0400 (Toll-Free) or +91 93151 60881\n\n` +
              `(To restart the AI bot anytime, simply type *#aion* or *Menu*)`;
          }

          return { replyText: takeoverReply };
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
    } else if (lang === "te") {
      msg = `🤖 *RN Valves AI అసిస్టెంట్*\n\n` +
        `క్షమించండి, నేను కేవలం RN Valves అధికారిక మెనూ మరియు నిర్దిష్ట సేవలలో మాత్రమే సహాయపడగలను.\n\n` +
        `మీరు మా కస్టమర్ సపోర్ట్ / సేల్స్ ప్రతినిధితో నేరుగా మాట్లాడాలనుకుంటున్నారా?\n\n` +
        `1. 👨‍💼 అవును, ప్రతినిధితో మాట్లాడాలి (Human Takeover)\n` +
        `2. 🏠 ప్రధాన మెనూకి తిరిగి వెళ్ళండి (Main Menu)\n\n` +
        `(దయచేసి 1 లేదా 2 పంపండి)`;
    } else if (lang === "ta") {
      msg = `🤖 *RN Valves AI உதவியாளர்*\n\n` +
        `மன்னிக்கவும், நான் RN Valves அதிகாரப்பூர்வ மெனு மற்றும் விருப்பங்களில் மட்டுமே உதவ முடியும்.\n\n` +
        `எங்கள் வாடிக்கையாளர் சேவை / விற்பனை பிரதிநிதியுடன் நேரடியாக பேச விரும்புகிறீர்களா?\n\n` +
        `1. 👨‍💼 ஆம், நேரடி பிரதிநிதியுடன் பேச வேண்டும் (Human Takeover)\n` +
        `2. 🏠 முதன்மை மெனுவுக்குச் செல்லவும் (Main Menu)\n\n` +
        `(தயவுசெய்து 1 அல்லது 2 அனுப்பவும்)`;
    } else if (lang === "ur") {
      msg = `🤖 *RN Valves AI اسسٹنٹ*\n\n` +
        `معذرت، میں صرف RN Valves کے آفیشل مینو اور طے شدہ آپشنز میں ہی مدد فراہم کر سکتا ہوں۔\n\n` +
        `کیا آپ ہمارے کسٹمر سپورٹ / سیلز نمائندے سے براہ راست بات کرنا چاہتے ہیں؟\n\n` +
        `1. 👨‍💼 جی ہاں، نمائندے سے بات کرنی ہے (Human Takeover)\n` +
        `2. 🏠 مین مینو پر واپس جائیں (Main Menu)\n\n` +
        `(براہ کرم 1 یا 2 بھیجیں)`;
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
    } else if (lang === "te") {
      msg = `📞 *RN Valves అధికారిక కస్టమర్ కేర్ & సపోర్ట్*\n\n` +
        `మీరు మా సహాయ విభాగాన్ని నేరుగా సంప్రదించవచ్చు:\n\n` +
        `☎️ *టోల్-ఫ్రీ కస్టమర్ కేర్:* 1800 12340 0400\n` +
        `🛠️ *ఫిర్యాదు & సర్వీస్ డెస్క్:* +91 98912 01208\n` +
        `📧 *అధికారిక ఈమెయిల్:* enquiry@rnvalves.com\n` +
        `📦 *వెబ్‌సైట్ ఆర్డర్ సహాయం:* +91 93156 03920 (E-Commerce Desk)\n` +
        `👤 *సేల్స్ హెల్ప్‌లైన్:* +91 93151 60881 (Amit Kumar Sir)\n` +
        `⏰ *పనివేళలు:* ఉదయం 10:00 నుండి సాయంత్రం 7:00 వరకు (సోమ-శని)\n\n` +
        `📍 *మీ ప్రాంతీయ సేల్స్ మేనేజర్‌తో కనెక్ట్ కావడానికి మీ 6-అంకెల పిన్ కోడ్ పంపండి!*\n\n` +
        `ప్రధాన మెనూ కోసం *Menu* అని పంపండి.`;
    } else if (lang === "ta") {
      msg = `📞 *RN Valves அதிகாரப்பூர்வ வாடிக்கையாளர் சேவை & ஆதரவு*\n\n` +
        `எங்கள் உதவி குழுவை நீங்கள் நேரடியாக தொடர்பு கொள்ளலாம்:\n\n` +
        `☎️ *கட்டணமில்லா வாடிக்கையாளர் சேவை:* 1800 12340 0400\n` +
        `🛠️ *புகார் மற்றும் சேவை மையம்:* +91 98912 01208\n` +
        `📧 *அதிகாரப்பூர்வ மின்னஞ்சல்:* enquiry@rnvalves.com\n` +
        `📦 *இணையதள ஆர்டர் உதவி:* +91 93156 03920 (E-Commerce Desk)\n` +
        `👤 *விற்பனை உதவி எண்:* +91 93151 60881 (Amit Kumar Sir)\n` +
        `⏰ *வேலை நேரம்:* காலை 10:00 முதல் மாலை 7:00 வரை (திங்கள்-சனி)\n\n` +
        `📍 *உங்கள் பிராந்திய விற்பனை மேலாளரை தொடர்பு கொள்ள உங்கள் 6-இலக்க பின் குறியீட்டை அனுப்பவும்!*\n\n` +
        `முதன்மை மெனுவுக்கு *Menu* என அனுப்பவும்.`;
    } else if (lang === "ur") {
      msg = `📞 *RN Valves آفیشل کسٹمر کیئر اور سپورٹ*\n\n` +
        `آپ براہ راست ہماری معاونت ٹیم سے رابطہ کر سکتے ہیں:\n\n` +
        `☎️ *ٹول فری کسٹمر کیئر:* 1800 12340 0400\n` +
        `🛠️ *شکایات و سروس ڈیسک:* +91 98912 01208\n` +
        `📧 *آفیشل ای میل:* enquiry@rnvalves.com\n` +
        `📦 *ویب سائٹ آرڈر معاونت:* +91 93156 03920 (E-Commerce Desk)\n` +
        `👤 *سیلز ہیلپ لائن:* +91 93151 60881 (Amit Kumar Sir)\n` +
        `⏰ *اوقات کار:* صبح 10:00 سے شام 7:00 بجے تک (پیر تا ہفتہ)\n\n` +
        `📍 *اپنے علاقائی سیلز مینیجر سے رابطہ کے لیے اپنا 6 ہندسوں کا پن کوڈ بھیجیں!* \n\n` +
        `مین مینو کے لیے *Menu* لکھیں۔`;
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
    } else if (lang === "te") {
      msg += `దయచేసి కేటలాగ్ కోసం ఉత్పత్తి విభాగాన్ని (Product Category) ఎంచుకోండి:\n\n`;
      msg += `1. CP Faucets (బ్రాస్ కుళాయిలు)\n`;
      msg += `2. PTMT Faucets (పీటీఎంటీ కుళాయిలు)\n`;
      msg += `3. Accessories (బాత్రూమ్ ఉపకరణాలు)\n`;
      msg += `4. Health Faucets (హెల్త్ ఫాసెట్స్)\n`;
      msg += `5. Showers (షవర్లు)\n`;
      msg += `6. Ball Valves (బాల్ వాల్వ్‌లు)\n`;
      msg += `7. All Categories (పూర్తి మాస్టర్ కేటలాగ్)\n`;
      msg += `8. 🏠 Main Menu\n\n`;
      msg += `(1 నుండి 8 వరకు ఒక నంబర్ పంపండి)`;
    } else if (lang === "ta") {
      msg += `தயவுசெய்து தயாரிப்பு வகையை (Product Category) தேர்ந்தெடுக்கவும்:\n\n`;
      msg += `1. CP Faucets (பித்தளை குழாய்கள்)\n`;
      msg += `2. PTMT Faucets (பிடிஎம்டி குழாய்கள்)\n`;
      msg += `3. Accessories (குளியலறை பாகங்கள்)\n`;
      msg += `4. Health Faucets (ஹெல்த் ஃபாகெட்ஸ்)\n`;
      msg += `5. Showers (ஷவர்கள்)\n`;
      msg += `6. Ball Valves (பால் வால்வுகள்)\n`;
      msg += `7. All Categories (முழு முதன்மை பட்டியல்)\n`;
      msg += `8. 🏠 Main Menu\n\n`;
      msg += `(1 முதல் 8 வரை ஒரு எண்ணை அனுப்பவும்)`;
    } else if (lang === "ur") {
      msg += `براہ کرم پروڈکٹ کیٹلاگ منتخب کریں:\n\n`;
      msg += `1. CP Faucets (پیتل کے نل)\n`;
      msg += `2. PTMT Faucets (پی ٹی ایم ٹی نل)\n`;
      msg += `3. Accessories (باتھ روم لوازمات)\n`;
      msg += `4. Health Faucets (ہیلتھ فاوسیٹس)\n`;
      msg += `5. Showers (شاورز)\n`;
      msg += `6. Ball Valves (بال والوز)\n`;
      msg += `7. All Categories (مکمل ماسٹر کیٹلاگ)\n`;
      msg += `8. 🏠 Main Menu\n\n`;
      msg += `(1 سے 8 میں سے ایک نمبر بھیجیں)`;
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
    } else if (lang === "te") {
      msg += `📍 *ప్రాంతం కనుగొనబడింది:* పిన్ కోడ్ ${pinCode} (${rep.state})\n\n`;
      msg += `మీ ప్రాంతీయ సేల్స్ మేనేజర్ సంప్రదింపు వివరాలు:\n\n`;
      msg += `👤 *పేరు:* ${rep.name}\n`;
      msg += `📱 *మొబైల్:* ${rep.mobile}\n`;
      msg += `💬 *WhatsApp:* https://wa.me/${cleanRepPhone}\n`;
      msg += `📍 *ప్రాంతం:* ${rep.area} (${rep.state})\n\n`;
      msg += `మీరు ముందుకు ఎలా కొనసాగాలనుకుంటున్నారు?\n`;
      msg += `1. 📝 Submit Requirement (అవసరాన్ని నమోదు చేయండి)\n`;
      msg += `2. 📄 View Other Catalogues (ఇతర కేటలాగ్‌లు చూడండి)\n`;
      msg += `3. 📞 Customer Care & Support (కస్టమర్ కేర్)\n`;
      msg += `4. 🏠 Main Menu`;
    } else if (lang === "ta") {
      msg += `📍 *பகுதி கண்டறியப்பட்டது:* பின் குறியீடு ${pinCode} (${rep.state})\n\n`;
      msg += `உங்கள் பிராந்திய விற்பனை மேலாளரின் தொடர்பு விவரங்கள்:\n\n`;
      msg += `👤 *பெயர்:* ${rep.name}\n`;
      msg += `📱 *கைபேசி:* ${rep.mobile}\n`;
      msg += `💬 *WhatsApp:* https://wa.me/${cleanRepPhone}\n`;
      msg += `📍 *பகுதி:* ${rep.area} (${rep.state})\n\n`;
      msg += `நீங்கள் அடுத்து என்ன செய்ய விரும்புகிறீர்கள்?\n`;
      msg += `1. 📝 Submit Requirement (தேவையை பதிவு செய்ய)\n`;
      msg += `2. 📄 View Other Catalogues (மற்ற அட்டவணைகளை பார்க்க)\n`;
      msg += `3. 📞 Customer Care & Support (வாடிக்கையாளர் சேவை)\n`;
      msg += `4. 🏠 Main Menu`;
    } else if (lang === "ur") {
      msg += `📍 *علاقہ ملا:* پن کوڈ ${pinCode} (${rep.state})\n\n`;
      msg += `آپ کے علاقائی سیلز مینیجر کے رابطہ کی تفصیلات:\n\n`;
      msg += `👤 *نام:* ${rep.name}\n`;
      msg += `📱 *موبائل:* ${rep.mobile}\n`;
      msg += `💬 *WhatsApp:* https://wa.me/${cleanRepPhone}\n`;
      msg += `📍 *علاقہ:* ${rep.area} (${rep.state})\n\n`;
      msg += `آپ آگے کیا کرنا چاہتے ہیں؟\n`;
      msg += `1. 📝 Submit Requirement (اپنی ضرورت درج کریں)\n`;
      msg += `2. 📄 View Other Catalogues (دیگر کیٹلاگ دیکھیں)\n`;
      msg += `3. 📞 Customer Care & Support (کسٹمر کیئر)\n`;
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

  /**
   * Helper: Smart Name Extractor & Sanitizer
   * Extracts clean name from phrases like "my name is jeetu singh", "mera naam rahul hai"
   */
  private static sanitizeAndExtractName(rawText: string): string {
    let name = rawText.trim();

    // 1. Remove common conversational prefixes
    name = name.replace(/^(my\s+name\s+is|mera\s+naam\s+hai|mera\s+naam|naam\s+hai|my\s+self|myself|i\s+am|im|i'm|this\s+is|here\s+is|hamara\s+naam|mera\s+name|naam)\s*[:\-]?\s+/i, "");

    // 2. Remove trailing words like "hai", "hoon", "hu", "here", "ji", "sir"
    name = name.replace(/\s+(hai|hoon|hu|here|ji|sir)$/i, "");

    // 3. Clean up quotes, brackets, and extra punctuation
    name = name.replace(/^["'`.\-_:\s]+|["'`.\-_:\s]+$/g, "").trim();

    // 4. Proper capitalize words if user typed in lowercase (e.g. "jeetu singh" -> "Jeetu Singh")
    if (name && name === name.toLowerCase()) {
      name = name
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }

    return name;
  }
}
