export interface CatalogueCategory {
  id: string;
  name: string;
  pdfUrl: string;
  imageUrl?: string;
}

export class CatalogueDirectory {
  private static masterPdfUrl = "https://rnvalves.com/uploads/aboutus/rn-catalogue-price-list-compressedpdf5kvoaov0mh23c3e2iedvrd0qhliikm.pdf";

  private static categories: Record<string, CatalogueCategory> = {
    "1": {
      id: "cp_faucets",
      name: "CP Faucets",
      pdfUrl: "https://uuhukdqfyvswwzgnkzsa.supabase.co/storage/v1/object/public/catalogues/catalogues/catalogue_cp_faucets_1787822980251.pdf",
    },
    "2": {
      id: "ptmt_faucets",
      name: "PTMT Faucets",
      pdfUrl: "https://uuhukdqfyvswwzgnkzsa.supabase.co/storage/v1/object/public/catalogues/catalogues/catalogue_ptmt_faucets_1787823150375.pdf",
    },
    "3": {
      id: "accessories",
      name: "Accessories",
      pdfUrl: "https://uuhukdqfyvswwzgnkzsa.supabase.co/storage/v1/object/public/catalogues/catalogues/catalogue_accessories_1787823159985.pdf",
    },
    "4": {
      id: "health_faucets",
      name: "Health Faucets",
      pdfUrl: "https://uuhukdqfyvswwzgnkzsa.supabase.co/storage/v1/object/public/catalogues/catalogues/catalogue_accessories_1787823159985.pdf",
    },
    "5": {
      id: "showers",
      name: "Showers",
      pdfUrl: "https://uuhukdqfyvswwzgnkzsa.supabase.co/storage/v1/object/public/catalogues/catalogues/catalogue_showers_1787823198506.pdf",
    },
    "6": {
      id: "ball_valves",
      name: "Ball Valves",
      pdfUrl: "https://uuhukdqfyvswwzgnkzsa.supabase.co/storage/v1/object/public/catalogues/catalogues/catalogue_ball_valves_1787823204122.pdf",
    },
    "7": {
      id: "all_categories",
      name: "All Categories",
      pdfUrl: "https://rnvalves.com/uploads/aboutus/rn-catalogue-price-list-compressedpdf5kvoaov0mh23c3e2iedvrd0qhliikm.pdf",
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
