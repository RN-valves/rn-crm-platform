import { getConversationStateModel, BotFlowState, IConversationState } from "../../models/ConversationState.js";
import { SalesRepDirectory, SalesRep } from "./salesRepDirectory.js";
import { CatalogueDirectory, CatalogueCategory } from "./catalogueDirectory.js";
import { getLeadModel } from "../../models/Lead.js";
import { ProductRepository } from "../../repositories/ProductRepository.js";
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

    // 3. Loop Guard Rate Limiter (20 msgs in 30s)
    const now = Date.now();
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

    // 4. Global Shortcuts (Hi / Reset, Main Menu, Change Language)
    const resetKeywords = ["hi", "hello", "reset", "start", "restart", "hlo", "hii"];
    const isReset = resetKeywords.includes(lower.replace(/[^a-zA-Z]/g, " ").trim());

    if (isReset && stateDoc.state !== "LANGUAGE_SELECTION") {
      stateDoc.state = "LANGUAGE_SELECTION";
      stateDoc.formData = {};
      await stateDoc.save();
      return this.renderLanguageSelection();
    }

    if (lower === "main menu" || lower === "menu") {
      stateDoc.state = "BUSINESS_MENU";
      await stateDoc.save();
      return this.renderBusinessMenu(stateDoc.language, stateDoc.customerType || "Dealer");
    }

    if (lower === "change language" || lower === "bhasha badle" || lower === "language") {
      stateDoc.state = "LANGUAGE_SELECTION";
      await stateDoc.save();
      return this.renderLanguageSelection();
    }

    // 5. Smart AI Catalog Bypass (e.g. "RNALP28G15" or specific product inquiry)
    const { skuCode, keywords } = ProductRepository.extractSearchTerms(cleanText);
    if (skuCode || (keywords.length >= 2 && !/^(1|2|3|4|5|6|7|8)$/.test(cleanText))) {
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

      const pin = pinMatch ? pinMatch[1] : (stateDoc.formData.pincode || "110001");
      let mob = phoneMatch ? phoneMatch[1].slice(-10) : phone;

      let shopName = "";
      const shopLine = cleanText.match(/(?:shop\s*name|firm|dukan|store)[:\s\-*]+([^\n\r]+)/i);
      if (shopLine) shopName = shopLine[1].replace(/[*_~`]/g, "").trim();

      let personName = "";
      const personLine = cleanText.match(/(?:contact\s*person|person\s*name|name)[:\s\-*]+([^\n\r]+)/i);
      if (personLine) personName = personLine[1].replace(/[*_~`]/g, "").trim();

      const finalName = personName || shopName || customerName || "Customer";
      const rep = SalesRepDirectory.getRepByPin(pin);
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
        mediaUrl: "https://rnvalves.com/catalogues/RN_Valves_Complete_Catalogue.pdf",
        mediaType: "document",
        mediaFileName: "RN_Valves_Complete_Catalogue.pdf",
        mediaCaption: "RN Valves & Faucets - Complete Product Catalogue",
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

        const chosenLang = langMap[lower] || (/2|hindi/i.test(lower) ? "hi" : /1|english/i.test(lower) ? "en" : null);

        if (!chosenLang) {
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
        if (lower === "5" || lower.includes("bhasha") || lower.includes("language")) {
          session.state = "LANGUAGE_SELECTION";
          return this.renderLanguageSelection();
        }

        if (lower === "4" || lower.includes("personal") || lower.includes("ghar")) {
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
        if (lower === "1" || lower.includes("distributor")) custType = "Distributor";
        else if (lower === "2" || lower.includes("dealer")) custType = "Dealer";
        else if (lower === "3" || lower.includes("retailer")) custType = "Retailer";

        if (!custType) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया 1 से 5 के बीच सही विकल्प चुनें:\n1. Distributor\n2. Dealer\n3. Retailer\n4. Personal Use\n5. भाषा बदलें`
              : `Please choose a valid option (1-5):\n1. Distributor\n2. Dealer\n3. Retailer\n4. Personal Use\n5. Change Language`,
          };
        }

        session.customerType = custType;
        session.state = "BUSINESS_MENU";
        return this.renderBusinessMenu(session.language, custType);
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
      // STATE 3: BUSINESS MENU
      // ----------------------------------------------------
      case "BUSINESS_MENU": {
        if (lower === "1" || lower.includes("catalog")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (lower === "2" || lower === "3" || lower.includes("pricing") || lower.includes("sales")) {
          // If PIN code already collected in session, reuse it
          if (session.formData.pincode && session.formData.pincode.length === 6) {
            const rep = SalesRepDirectory.getRepByPin(session.formData.pincode);
            session.state = "SALES_REP_SHOWN";
            return this.renderSalesRepCard(session.language, rep, session.formData.pincode);
          }

          session.state = "SALES_PIN_CODE";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपने क्षेत्र का 6-अंकीय एरिया पिन कोड (Area PIN Code) दर्ज करें:\n(उदाहरण: 110001)`
              : `Please enter your 6-digit Area PIN Code to connect with your Regional Sales Manager:\n(Example: 110001)`,
          };
        }

        if (lower === "4" || lower.includes("submit") || lower.includes("requirement")) {
          session.state = "FORM_NAME";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना पूरा नाम दर्ज करें:`
              : `Please enter your Full Name:`,
          };
        }

        if (lower === "5" || lower.includes("main menu")) {
          session.state = "REQUIREMENT_TYPE";
          return this.renderRequirementType(session.language);
        }

        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `माफ़ कीजिए, मैं समझ नहीं पाया। कृपया 1-5 में से चुनें:`
            : `Sorry, I couldn't understand. Please choose from 1-5:`,
        };
      }

      // ----------------------------------------------------
      // STATE 4: PRODUCT CATALOGUES
      // ----------------------------------------------------
      case "PRODUCT_CATALOGUES": {
        if (lower === "8" || lower.includes("main menu")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        const category = CatalogueDirectory.getCategory(lower);
        if (!category) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया 1 से 8 में से एक श्रेणी चुनें:`
              : `Please choose a valid category (1-8):`,
          };
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
        if (lower === "1" || lower.includes("sales")) {
          session.state = "SALES_PIN_CODE";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपने क्षेत्र का 6-अंकीय एरिया पिन कोड (Area PIN Code) दर्ज करें:`
              : `Please enter your 6-digit Area PIN Code:`,
          };
        }

        if (lower === "2" || lower.includes("submit")) {
          session.state = "FORM_NAME";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना पूरा नाम दर्ज करें:`
              : `Please enter your Full Name:`,
          };
        }

        if (lower === "3" || lower.includes("other") || lower.includes("category")) {
          session.state = "PRODUCT_CATALOGUES";
          return this.renderCategorySelection(session.language);
        }

        if (lower === "4" || lower.includes("main menu") || lower.includes("menu")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `कृपया 1 से 4 में से चुनें:\n1. Talk to Sales Team\n2. Submit Requirement\n3. View Other Categories\n4. Main Menu`
            : `Please choose an option (1-4):\n1. Talk to Sales Team\n2. Submit Requirement\n3. View Other Categories\n4. Main Menu`,
        };
      }

      // ----------------------------------------------------
      // STATE 6: SALES PIN CODE
      // ----------------------------------------------------
      case "SALES_PIN_CODE": {
        const cleanPin = text.replace(/\D/g, "");
        if (cleanPin.length !== 6) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया 6 अंकों का मान्य पिन कोड दर्ज करें। उदाहरण: 110001`
              : `Please enter a valid 6-digit PIN Code. Example: 110001`,
          };
        }

        session.formData.pincode = cleanPin;
        const rep = SalesRepDirectory.getRepByPin(cleanPin);
        session.formData.assignedAgent = rep;
        session.state = "SALES_REP_SHOWN";

        return this.renderSalesRepCard(session.language, rep, cleanPin);
      }

      // ----------------------------------------------------
      // STATE 7: SALES REP SHOWN
      // ----------------------------------------------------
      case "SALES_REP_SHOWN": {
        if (lower === "1" || lower.includes("main menu") || lower.includes("menu")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }

        if (lower === "2" || lower.includes("submit")) {
          session.state = "FORM_NAME";
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना पूरा नाम दर्ज करें:`
              : `Please enter your Full Name:`,
          };
        }

        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `कृपया 1 या 2 चुनें:\n1. Main Menu\n2. Submit Requirement`
            : `Please choose 1 or 2:\n1. Main Menu\n2. Submit Requirement`,
        };
      }

      // ----------------------------------------------------
      // STATE 8: FORM - NAME
      // ----------------------------------------------------
      case "FORM_NAME": {
        const cleanName = text.trim();
        // Validation: Must not contain digits or special characters, length >= 2
        if (cleanName.length < 2 || /[0-9@#$%^&*()_+=\[\]{}|\\/<>~`]/g.test(cleanName)) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया अपना मान्य नाम लिखें (अंकों या विशेष चिन्हों के बिना)।`
              : `Please enter a valid name (without numbers or special characters).`,
          };
        }

        session.formData.name = cleanName;
        session.state = "FORM_MOBILE";
        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `धन्यवाद ${cleanName}! कृपया अपना 10 अंकों का मोबाइल नंबर दर्ज करें:`
            : `Thank you ${cleanName}! Please enter your 10-digit mobile number:`,
        };
      }

      // ----------------------------------------------------
      // STATE 9: FORM - MOBILE
      // ----------------------------------------------------
      case "FORM_MOBILE": {
        const cleanMobile = text.replace(/\D/g, "");
        if (cleanMobile.length !== 10) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें। उदाहरण: 9876543210`
              : `Please share a valid 10-digit mobile number. Example: 9876543210`,
          };
        }

        session.formData.mobile = cleanMobile;
        session.state = "FORM_PIN";
        const isHi = session.language === "hi";
        return {
          replyText: isHi
            ? `कृपया अपने एरिया का 6-अंकीय पिन कोड (PIN Code) दर्ज करें:`
            : `Please enter your 6-digit Area PIN Code:`,
        };
      }

      // ----------------------------------------------------
      // STATE 10: FORM - PIN CODE
      // ----------------------------------------------------
      case "FORM_PIN": {
        const cleanPin = text.replace(/\D/g, "");
        if (cleanPin.length !== 6) {
          const isHi = session.language === "hi";
          return {
            replyText: isHi
              ? `कृपया 6 अंकों का मान्य पिन कोड दर्ज करें। उदाहरण: 110001`
              : `Please enter a valid 6-digit PIN Code. Example: 110001`,
          };
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
        const cat = CatalogueDirectory.getCategory(lower);
        const interestName = cat ? cat.name : "All Categories";
        session.formData.interestedCategory = interestName;

        // 1. Save Lead into CRM Database
        const Lead = getLeadModel();
        const rep = session.formData.assignedAgent || SalesRepDirectory.getRepByPin(session.formData.pincode || "110001");
        const leadNumber = `RNL-${Math.floor(10000 + Math.random() * 90000)}`;

        try {
          await Lead.create({
            leadNumber,
            customerName: session.formData.name || customerName || "Customer",
            phone: session.formData.mobile || session.phone,
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

        session.state = "COMPLETED";
        const isHi = session.language === "hi";

        let finalMsg = "";
        if (isHi) {
          finalMsg = `🎉 *धन्यवाद ${session.formData.name}!* आपकी आवश्यकता सफलतापूर्वक दर्ज कर ली गई है।\n\n`;
          finalMsg += `📋 *आपके विवरण:*\n`;
          finalMsg += `• नाम: ${session.formData.name}\n`;
          finalMsg += `• मोबाइल: ${session.formData.mobile}\n`;
          finalMsg += `• पिन कोड: ${session.formData.pincode}\n`;
          finalMsg += `• उत्पाद रुचि: ${interestName}\n\n`;
          finalMsg += `👤 *आपके क्षेत्रीय बिक्री प्रतिनिधि (Regional Sales Manager):*\n`;
          finalMsg += `• नाम: *${rep.name}*\n`;
          finalMsg += `• मोबाइल: *${rep.mobile}*\n`;
          finalMsg += `• क्षेत्र: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `हमारी बिक्री टीम आपसे जल्द ही संपर्क करेगी।\n\n1. 🏠 Main Menu`;
        } else {
          finalMsg = `🎉 *Thank you ${session.formData.name}!* Your requirement has been successfully submitted.\n\n`;
          finalMsg += `📋 *Your Details:*\n`;
          finalMsg += `• Name: ${session.formData.name}\n`;
          finalMsg += `• Mobile: ${session.formData.mobile}\n`;
          finalMsg += `• PIN Code: ${session.formData.pincode}\n`;
          finalMsg += `• Category: ${interestName}\n\n`;
          finalMsg += `👤 *Your Regional Sales Representative:*\n`;
          finalMsg += `• Name: *${rep.name}*\n`;
          finalMsg += `• Mobile: *${rep.mobile}*\n`;
          finalMsg += `• Territory: ${rep.area} (${rep.state})\n\n`;
          finalMsg += `Our team will contact you shortly.\n\n1. 🏠 Main Menu`;
        }

        return {
          replyText: finalMsg,
          mediaUrl: cat ? cat.pdfUrl : "https://rnvalves.com/catalogues/RN_Valves_Complete_Catalogue.pdf",
          mediaType: "document",
          mediaFileName: cat ? `RN_Valves_${cat.id}.pdf` : "RN_Valves_Complete_Catalogue.pdf",
          mediaCaption: `RN Valves & Faucets - ${interestName} Catalogue`,
        };
      }

      // ----------------------------------------------------
      // STATE 12: COMPLETED
      // ----------------------------------------------------
      case "COMPLETED": {
        if (lower === "1" || lower.includes("main menu") || lower.includes("menu")) {
          session.state = "BUSINESS_MENU";
          return this.renderBusinessMenu(session.language, session.customerType || "Dealer");
        }
        return {
          replyText: session.language === "hi"
            ? `मुख्य मेन्यू पर जाने के लिए कृपया *1* या *Main Menu* लिखें।`
            : `To return to the main menu, please type *1* or *Main Menu*.`,
        };
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
    const isHi = lang === "hi";
    let msg = "";
    if (isHi) {
      msg += `*RN Valves & Faucets* में आपका स्वागत है! 🙏\n\n`;
      msg += `सबसे पहले बताइए, आपकी आवश्यकता किसके लिए है?\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use (घर के लिए)\n`;
      msg += `5. 🌐 भाषा बदलें (Change Language)\n\n`;
      msg += `(कृपया 1 से 5 में से एक विकल्प चुनें)`;
    } else {
      msg += `Welcome to *RN Valves & Faucets*! 🙏\n\n`;
      msg += `First, please tell us what you are looking for:\n`;
      msg += `1. 🏢 Distributor\n`;
      msg += `2. 🏪 Dealer\n`;
      msg += `3. 🛍️ Retailer\n`;
      msg += `4. 🏠 Personal Use\n`;
      msg += `5. 🌐 Change Language\n\n`;
      msg += `(Please reply with 1 to 5)`;
    }

    return { replyText: msg };
  }

  private static renderBusinessMenu(lang: string, customerType: string): FlowResponse {
    const isHi = lang === "hi";
    let msg = "";
    if (isHi) {
      msg += `*${customerType} Business Menu*\n`;
      msg += `कृपया चुनें कि आपको किस संबंध में सहायता चाहिए:\n\n`;
      msg += `1. 📄 Product Catalogues (उत्पाद कैटलॉग)\n`;
      msg += `2. 💰 Pricing / Enquiry (मूल्य / पूछताछ)\n`;
      msg += `3. 👤 Talk to Sales Team (बिक्री टीम से बात करें)\n`;
      msg += `4. 📝 Submit Requirement (आवश्यकता दर्ज करें)\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(कृपया 1 से 5 में से चुनें)`;
    } else {
      msg += `*${customerType} Business Menu*\n`;
      msg += `Please select how we can assist you:\n\n`;
      msg += `1. 📄 Product Catalogues\n`;
      msg += `2. 💰 Pricing / Enquiry\n`;
      msg += `3. 👤 Talk to Sales Team\n`;
      msg += `4. 📝 Submit Requirement\n`;
      msg += `5. 🏠 Main Menu\n\n`;
      msg += `(Please reply with 1 to 5)`;
    }

    return { replyText: msg };
  }

  private static renderCategorySelection(lang: string): FlowResponse {
    const isHi = lang === "hi";
    let msg = "";
    if (isHi) {
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
    const isHi = lang === "hi";
    let msg = "";
    if (isHi) {
      msg += `📍 *क्षेत्र खोज:* पिन कोड ${pinCode} (${rep.state})\n\n`;
      msg += `यहाँ आपके क्षेत्रीय बिक्री प्रतिनिधि (Regional Sales Manager) के संपर्क विवरण हैं:\n\n`;
      msg += `👤 *नाम:* ${rep.name}\n`;
      msg += `📱 *मोबाइल:* ${rep.mobile}\n`;
      msg += `📍 *क्षेत्र:* ${rep.area} (${rep.state})\n\n`;
      msg += `आप आगे क्या करना चाहेंगे?\n`;
      msg += `1. 🏠 Main Menu\n`;
      msg += `2. 📝 Submit Requirement`;
    } else {
      msg += `📍 *Region Located:* PIN Code ${pinCode} (${rep.state})\n\n`;
      msg += `Here are the contact details for your Regional Sales Manager:\n\n`;
      msg += `👤 *Name:* ${rep.name}\n`;
      msg += `📱 *Mobile:* ${rep.mobile}\n`;
      msg += `📍 *Territory:* ${rep.area} (${rep.state})\n\n`;
      msg += `How would you like to proceed?\n`;
      msg += `1. 🏠 Main Menu\n`;
      msg += `2. 📝 Submit Requirement`;
    }

    return { replyText: msg };
  }
}
