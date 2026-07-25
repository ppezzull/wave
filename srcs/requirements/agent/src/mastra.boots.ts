// mastra boots smoke — does the Mastra registry + LibSQL storage + MCPServer
// + composeAgent construct WITHOUT throwing? No LLM call, no network — safe to
// run locally without Ollama. Run: npx tsx src/mastra.boots.ts
import "dotenv/config";
import { mastra } from "./mastra/index.js";

console.log("✅ Mastra registry constructed (import OK — storage + MCPServer + agent wired)");
try {
  console.log("   agents      :", mastra.listAgents());
} catch (e) {
  console.log("   listAgents  :", (e as Error).message);
}
try {
  console.log("   mcp servers :", mastra.listMCPServers());
} catch (e) {
  console.log("   listMCP     :", (e as Error).message);
}
