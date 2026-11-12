import { getSalesExecutiveModel, INITIAL_SALES_EXECUTIVES } from "../../models/SalesExecutive.js";

export interface SalesRep {
  name: string;
  mobile: string;
  area: string;
  state: string;
  pinPrefixes?: string[];
  _id?: string;
}

export class SalesRepDirectory {
  public static defaultRep: SalesRep = {
    name: "Amit Kumar Sir",
    mobile: "+91 93151 60881",
    area: "Central Support / Head Office",
    state: "Pan-India",
  };

  private static cachedExecutives: SalesRep[] = [...INITIAL_SALES_EXECUTIVES];
  private static lastCacheTime = 0;

  /**
   * Refresh in-memory executive list from MongoDB
   */
  static async refreshCache(): Promise<SalesRep[]> {
    try {
      const Model = getSalesExecutiveModel();
      const docs = await Model.find({ isActive: true }).sort({ orderIndex: 1 }).lean();
      if (docs && docs.length > 0) {
        this.cachedExecutives = docs.map((d: any) => ({
          _id: String(d._id),
          name: d.name,
          mobile: d.mobile,
          area: d.area,
          state: d.state,
          pinPrefixes: d.pinPrefixes || [],
        }));
        this.lastCacheTime = Date.now();

        const fallback = docs.find((d: any) => d.isDefaultFallback);
        if (fallback) {
          this.defaultRep = {
            name: fallback.name,
            mobile: fallback.mobile,
            area: fallback.area || "Head Office",
            state: fallback.state || "Pan-India",
          };
        }
      }
    } catch (err: any) {
      console.warn(`[SalesRepDirectory] Cache refresh notice: ${err.message}`);
    }
    return this.cachedExecutives;
  }

  /**
   * Return all active sales executives
   */
  static async getAllExecutives(): Promise<SalesRep[]> {
    if (Date.now() - this.lastCacheTime > 60000) {
      await this.refreshCache();
    }
    return this.cachedExecutives;
  }

  /**
   * Universal Fallback Rep (Amit Kumar Sir: +91 93151 60881)
   */
  static getFallbackRep(): SalesRep {
    return this.defaultRep;
  }

  /**
   * Map 6-digit Indian PIN Code to Regional Sales Manager
   */
  static getRepByPin(pinCode: string): SalesRep {
    const cleanPin = pinCode.replace(/\D/g, "");
    if (cleanPin.length !== 6) {
      return this.defaultRep;
    }

    const prefix2 = cleanPin.substring(0, 2);

    // 1. Dynamic Check against database-configured executives
    if (this.cachedExecutives && this.cachedExecutives.length > 0) {
      const matched = this.cachedExecutives.find((exec) =>
        exec.pinPrefixes && exec.pinPrefixes.includes(prefix2)
      );
      if (matched) {
        return {
          name: matched.name,
          mobile: matched.mobile,
          area: matched.area,
          state: matched.state,
        };
      }
    }

    // 2. Built-in Territorial Fallback Mapping
    // Delhi NCR (11), UP (20-28), Bihar (80-85) -> Arpita
    if (
      prefix2 === "11" ||
      ["20", "21", "22", "23", "24", "25", "26", "27", "28"].includes(prefix2) ||
      ["80", "81", "82", "84", "85"].includes(prefix2)
    ) {
      return {
        name: "Arpita",
        mobile: "+91 93155 96055",
        area: prefix2 === "11" ? "Delhi NCR" : "UP / Bihar Region",
        state: "UP / Bihar / Delhi NCR",
      };
    }

    // Haryana, Punjab, Gujarat, Odisha -> Amit Kumar Sir
    if (
      ["12", "13", "14", "15", "16", "17", "18", "19", "36", "37", "38", "39", "75", "76", "77"].includes(prefix2)
    ) {
      return {
        name: "Amit Kumar Sir",
        mobile: "+91 93151 60881",
        area: "Haryana / Punjab / Gujarat Region",
        state: "Haryana / Gujarat / Punjab / Odisha",
      };
    }

    // Rajasthan, MP, Chhattisgarh -> Gaurav
    if (
      ["30", "31", "32", "33", "34", "45", "46", "47", "48", "49"].includes(prefix2)
    ) {
      return {
        name: "Gaurav",
        mobile: "+91 93155 93842",
        area: "Rajasthan / MP / Chhattisgarh Region",
        state: "Rajasthan / MP / Chhattisgarh",
      };
    }

    // Maharashtra, Kerala, Goa -> Vinod
    if (
      ["40", "41", "42", "43", "44", "67", "68", "69"].includes(prefix2)
    ) {
      return {
        name: "Vinod",
        mobile: "+91 96433 08980",
        area: "Maharashtra & Kerala Region",
        state: "Maharashtra / Kerala / Goa",
      };
    }

    // Telangana, Andhra Pradesh -> Khusi
    if (["50", "51", "52", "53"].includes(prefix2)) {
      return {
        name: "Khusi",
        mobile: "+91 80765 55914",
        area: "Andhra Pradesh / Telangana (Hyderabad)",
        state: "Andhra Pradesh / Telangana",
      };
    }

    // Karnataka -> Pradeep
    if (["56", "57", "58", "59"].includes(prefix2)) {
      return {
        name: "Pradeep",
        mobile: "+91 98702 88812",
        area: "Karnataka Region",
        state: "Karnataka",
      };
    }

    // West Bengal, Assam, Tamil Nadu, Jharkhand -> Danish
    if (
      ["60", "61", "62", "63", "64", "70", "71", "72", "73", "74", "78", "79", "83"].includes(prefix2)
    ) {
      return {
        name: "Danish",
        mobile: "+91 93156 00189",
        area: "WB / Tamil Nadu / Assam / Jharkhand",
        state: "WB / Assam / Tamil Nadu / Jharkhand",
      };
    }

    return this.defaultRep;
  }
}
