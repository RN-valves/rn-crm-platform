export interface SalesRep {
  name: string;
  mobile: string;
  area: string;
  state: string;
}

export class SalesRepDirectory {
  private static defaultRep: SalesRep = {
    name: "Amit Kumar",
    mobile: "+91 93151 60881",
    area: "Head Office / Central Support",
    state: "Delhi NCR",
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

    // 1. Delhi & NCR (11xxxx, 20xxxx partially)
    if (prefix2 === "11") {
      return {
        name: "Amit Kumar",
        mobile: "+91 93151 60881",
        area: "Connaught Place / Delhi NCR",
        state: "Delhi",
      };
    }

    // 2. Maharashtra & Mumbai (40xxxx to 44xxxx)
    if (["40", "41", "42", "43", "44"].includes(prefix2)) {
      return {
        name: "Vinod",
        mobile: "+91 93151 60882",
        area: "Mumbai & Maharashtra Region",
        state: "Maharashtra",
      };
    }

    // 3. Telangana & Andhra Pradesh / Hyderabad (50xxxx to 53xxxx)
    if (["50", "51", "52", "53"].includes(prefix2)) {
      return {
        name: "Pavani Avadhutha",
        mobile: "+91 93151 60883",
        area: "Hyderabad & South India",
        state: "Telangana / AP",
      };
    }

    // 4. Rajasthan / Jaipur (30xxxx to 34xxxx)
    if (["30", "31", "32", "33", "34"].includes(prefix2)) {
      return {
        name: "Gaurav",
        mobile: "+91 93151 60884",
        area: "Jaipur & Rajasthan Region",
        state: "Rajasthan",
      };
    }

    // 5. Uttar Pradesh & Lucknow (20xxxx to 28xxxx)
    if (["20", "21", "22", "23", "24", "25", "26", "27", "28"].includes(prefix2)) {
      return {
        name: "Arpita",
        mobile: "+91 93151 60885",
        area: "Lucknow & Uttar Pradesh Region",
        state: "Uttar Pradesh",
      };
    }

    // 6. Kolkata District (70xxxx)
    if (prefix2 === "70") {
      return {
        name: "Amit Kumar",
        mobile: "+91 93151 60881",
        area: "Kolkata District",
        state: "West Bengal",
      };
    }

    // 7. Rest of West Bengal (71xxxx to 74xxxx)
    if (["71", "72", "73", "74"].includes(prefix2)) {
      return {
        name: "Danish",
        mobile: "+91 93151 60886",
        area: "West Bengal & Eastern Region",
        state: "West Bengal",
      };
    }

    // 8. Fallback to Delhi Head Office Rep
    return this.defaultRep;
  }
}
