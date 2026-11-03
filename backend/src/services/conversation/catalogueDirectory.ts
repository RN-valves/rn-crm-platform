export interface CatalogueCategory {
  id: string;
  name: string;
  pdfUrl: string;
  imageUrl?: string;
}

export class CatalogueDirectory {
  private static categories: Record<string, CatalogueCategory> = {
    "1": {
      id: "cp_faucets",
      name: "CP Faucets",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_CP_Faucets.pdf",
    },
    "2": {
      id: "ptmt_faucets",
      name: "PTMT Faucets",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_PTMT_Faucets.pdf",
    },
    "3": {
      id: "accessories",
      name: "Accessories",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_Accessories.pdf",
    },
    "4": {
      id: "health_faucets",
      name: "Health Faucets",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_Health_Faucets.pdf",
    },
    "5": {
      id: "showers",
      name: "Showers",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_Showers.pdf",
    },
    "6": {
      id: "ball_valves",
      name: "Ball Valves",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_Ball_Valves.pdf",
    },
    "7": {
      id: "all_categories",
      name: "All Categories",
      pdfUrl: "https://rnvalves.com/catalogues/RN_Valves_Complete_Catalogue.pdf",
    },
  };

  static getCategory(choiceOrName: string): CatalogueCategory | null {
    const clean = choiceOrName.trim().toLowerCase();

    // Choice by number
    if (this.categories[clean]) {
      return this.categories[clean];
    }

    // Match by name
    for (const cat of Object.values(this.categories)) {
      if (cat.name.toLowerCase().includes(clean) || clean.includes(cat.name.toLowerCase())) {
        return cat;
      }
    }

    // Keyword matching
    if (clean.includes("cp") || clean.includes("brass faucet")) return this.categories["1"];
    if (clean.includes("ptmt") || clean.includes("plastic")) return this.categories["2"];
    if (clean.includes("access")) return this.categories["3"];
    if (clean.includes("health")) return this.categories["4"];
    if (clean.includes("shower")) return this.categories["5"];
    if (clean.includes("valve") || clean.includes("ball")) return this.categories["6"];
    if (clean.includes("all") || clean.includes("complete")) return this.categories["7"];

    return null;
  }

  static getAll(): Record<string, CatalogueCategory> {
    return this.categories;
  }
}
