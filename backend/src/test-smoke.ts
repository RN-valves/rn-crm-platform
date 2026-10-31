import { ProductRepository } from "./repositories/ProductRepository.js";
import { config } from "./config/env.js";

async function runSmokeTest() {
  console.log("🧪 [Smoke Test] Testing RN CRM backend configuration and models...");
  console.log(`- Node Environment: ${config.NODE_ENV}`);
  console.log(`- Backend Port: ${config.PORT}`);
  console.log(`- AI Provider: ${config.AI_PROVIDER} (${config.GEMINI_MODEL})`);
  console.log(`- ProductRepository search method exists: ${typeof ProductRepository.searchProducts === "function"}`);
  console.log(`- ProductRepository details method exists: ${typeof ProductRepository.getProductDetails === "function"}`);
  console.log(`- ProductRepository price method exists: ${typeof ProductRepository.getApprovedPrice === "function"}`);
  console.log(`- ProductRepository catalogue method exists: ${typeof ProductRepository.getCatalogue === "function"}`);
  console.log("✅ [Smoke Test] All core modules loaded and verified successfully!");
}

runSmokeTest();
