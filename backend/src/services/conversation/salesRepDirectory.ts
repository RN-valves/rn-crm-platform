export interface SalesRep {
  name: string;
  mobile: string;
  area: string;
  state: string;
}

export class SalesRepDirectory {
  private static defaultRep: SalesRep = {
    name: "Amit Kumar Sir",
    mobile: "+91 93151 60881",
    area: "Central Support / Head Office",
    state: "Pan-India",
  };

  /**
   * Map 6-digit Indian PIN Code to Regional Sales Manager
   */
  static getRepByPin(pinCode: string): SalesRep {
    const cleanPin = pinCode.replace(/\D/g, "");
    if (cleanPin.length !== 6) {
      return this.defaultRep;
    }

    const prefix2 = cleanPin.substring(0, 2);

    // 1. ARPITA (+91 93155 96055): UP, BIHAR, DELHI NCR
    // Delhi NCR (11), UP (20 to 28), Bihar (80, 81, 82, 84, 85)
    if (
      prefix2 === "11" ||
      ["20", "21", "22", "23", "24", "25", "26", "27", "28"].includes(prefix2) ||
      ["80", "81", "82", "84", "85"].includes(prefix2)
    ) {
      const areaLabel =
        prefix2 === "11"
          ? "Delhi NCR"
          : ["80", "81", "82", "84", "85"].includes(prefix2)
          ? "Bihar Region"
          : "Uttar Pradesh (UP)";
      return {
        name: "Arpita",
        mobile: "+91 93155 96055",
        area: areaLabel,
        state: "UP / Bihar / Delhi NCR",
      };
    }

    // 2. AMIT KUMAR SIR (+91 93151 60881): HARYANA, GUJARAT, PUNJAB, ORISSA (ODISHA)
    // Haryana (12, 13), Punjab & Chandigarh (14, 15, 16), Gujarat (36, 37, 38, 39), Odisha (75, 76, 77)
    // Also covers northern union territories (17, 18, 19 HP / J&K)
    if (
      ["12", "13", "14", "15", "16", "17", "18", "19"].includes(prefix2) ||
      ["36", "37", "38", "39"].includes(prefix2) ||
      ["75", "76", "77"].includes(prefix2)
    ) {
      let areaLabel = "Haryana / Punjab Region";
      if (["36", "37", "38", "39"].includes(prefix2)) areaLabel = "Gujarat Region";
      else if (["75", "76", "77"].includes(prefix2)) areaLabel = "Odisha (Orissa) Region";

      return {
        name: "Amit Kumar Sir",
        mobile: "+91 93151 60881",
        area: areaLabel,
        state: "Haryana / Gujarat / Punjab / Odisha",
      };
    }

    // 3. GAURAV (+91 93155 93842): RAJASTHAN, MP, CHHATTISGARH
    // Rajasthan (30 to 34), Madhya Pradesh (45 to 48), Chhattisgarh (49)
    if (
      ["30", "31", "32", "33", "34"].includes(prefix2) ||
      ["45", "46", "47", "48"].includes(prefix2) ||
      prefix2 === "49"
    ) {
      const areaLabel =
        ["30", "31", "32", "33", "34"].includes(prefix2)
          ? "Rajasthan Region"
          : prefix2 === "49"
          ? "Chhattisgarh Region"
          : "Madhya Pradesh (MP)";
      return {
        name: "Gaurav",
        mobile: "+91 93155 93842",
        area: areaLabel,
        state: "Rajasthan / MP / Chhattisgarh",
      };
    }

    // 4. VINOD (+91 96433 08980): MAHARASHTRA, KERALA, GOA
    // Maharashtra & Goa (40 to 44), Kerala (67, 68, 69)
    if (
      ["40", "41", "42", "43", "44"].includes(prefix2) ||
      ["67", "68", "69"].includes(prefix2)
    ) {
      const areaLabel = ["67", "68", "69"].includes(prefix2)
        ? "Kerala Region"
        : "Maharashtra & Goa Region";
      return {
        name: "Vinod",
        mobile: "+91 96433 08980",
        area: areaLabel,
        state: "Maharashtra / Kerala / Goa",
      };
    }

    // 5. KHUSI (+91 80765 55914): ANDHRA PRADESH & TELANGANA (HYDERABAD)
    // Telangana (50), Andhra Pradesh (51, 52, 53)
    if (["50", "51", "52", "53"].includes(prefix2)) {
      return {
        name: "Khusi",
        mobile: "+91 80765 55914",
        area: "Andhra Pradesh / Telangana (Hyderabad)",
        state: "Andhra Pradesh / Telangana",
      };
    }

    // 6. PRADEEP (+91 98702 88812): KARNATAKA
    // Karnataka (56 to 59)
    if (["56", "57", "58", "59"].includes(prefix2)) {
      return {
        name: "Pradeep",
        mobile: "+91 98702 88812",
        area: "Karnataka Region",
        state: "Karnataka",
      };
    }

    // 7. DANISH (+91 93156 00189): WEST BENGAL, ASSAM, TAMIL NADU, JHARKHAND
    // Tamil Nadu (60 to 64), West Bengal (70 to 74), Assam & NE (78, 79), Jharkhand (83)
    if (
      ["60", "61", "62", "63", "64"].includes(prefix2) ||
      ["70", "71", "72", "73", "74"].includes(prefix2) ||
      ["78", "79"].includes(prefix2) ||
      prefix2 === "83"
    ) {
      let areaLabel = "West Bengal & Eastern Region";
      if (["60", "61", "62", "63", "64"].includes(prefix2)) areaLabel = "Tamil Nadu Region";
      else if (["78", "79"].includes(prefix2)) areaLabel = "Assam & North-East";
      else if (prefix2 === "83") areaLabel = "Jharkhand Region";

      return {
        name: "Danish",
        mobile: "+91 93156 00189",
        area: areaLabel,
        state: "WB / Assam / Tamil Nadu / Jharkhand",
      };
    }

    // 8. Fallback to Amit Kumar Sir for unmapped territories
    return this.defaultRep;
  }
}
