/**
 * Corporate & Automated Bot Filter Service
 * Identifies and blocks enterprise bots (Jio, SBI, Banks, RBI, OTPs, Utility services)
 * to prevent auto-reply loops and exclude them from CRM lead metrics.
 */

export const KNOWN_CORPORATE_BOT_NUMBERS = [
  "9999041935", // RBI Official WhatsApp Channel
  "7669800566", // BigBasket Customer Support Auto-responder
  "7000770007", // JioCare Official
  "8799941000", // Jio Automated Support
  "8799902000", // Jio Corporate Service Bot
  "8799904000", // JioFiber Support
  "8799982000", // Jio Enterprise Broadcast
  "9022690226", // State Bank of India (SBI) WhatsApp Banking
  "7208933145", // SBI Card WhatsApp
  "7208933142", // SBI Mutual Fund
  "7065970659", // HDFC Bank WhatsApp
  "8640086400", // ICICI Bank WhatsApp
  "9555144488", // Axis Bank WhatsApp
  "9643977977", // Kotak Mahindra Bank
  "9900012345", // Airtel Official WhatsApp
  "9654297000", // Vodafone Idea (Vi) WhatsApp
];

export const CORPORATE_BOT_PREFIXES = [
  "87999", // Reliance Jio Enterprise Series
];

export const CORPORATE_BOT_REGEX =
  /jiofiber|jiocare|t\.jio\/|bit\.ly\/jio|rbi’s official|reserve bank of india|sbi card|state bank of india|sbi whatsapp|hdfc bank|icici bank|axis bank|kotak|this channel isn’t monitored|unmonitored channel|do not reply to this message|whatsapp banking|bank statement|account balance|debited by inr|credited with inr|otp is|verification code is|one time password|thanks for reaching out to bigbasket|swiggy|zomato/i;

export function normalizePhone10(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

export function isCorporateBotNumber(phone: string): boolean {
  if (!phone) return false;
  const p10 = normalizePhone10(phone);
  if (!p10) return false;

  if (KNOWN_CORPORATE_BOT_NUMBERS.includes(p10)) {
    return true;
  }

  for (const prefix of CORPORATE_BOT_PREFIXES) {
    if (p10.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

export function isCorporateBotContent(content: string): boolean {
  if (!content) return false;
  return CORPORATE_BOT_REGEX.test(content);
}

export function isCorporateBot(phone: string, content?: string): boolean {
  if (isCorporateBotNumber(phone)) return true;
  if (content && isCorporateBotContent(content)) return true;
  return false;
}

/**
 * Returns a MongoDB query filter condition to exclude all known corporate bots
 */
export function getCorporateBotMongoFilter(field = "phone"): any {
  const patterns = [
    ...KNOWN_CORPORATE_BOT_NUMBERS,
    ...CORPORATE_BOT_PREFIXES.map((p) => `^(\\+?91)?${p}`),
  ];
  return {
    [field]: {
      $not: new RegExp(`(${patterns.join("|")})`),
    },
  };
}
