import { FastMCP } from "fastmcp";
import { ActualConnection } from "./actual-connection";
import { withErrorHandling } from "./tools/shared";
import { getBudgetTools } from "./tools/budgets";
import { getTransactionTools } from "./tools/transactions";
import { getAccountTools } from "./tools/accounts";

export function registerTools(
  server: FastMCP,
  actualConnection: ActualConnection
) {
  // ========================================
  // RAW DATA EXPOSURE TOOLS WITH ERROR HANDLING
  // ========================================
  const tools = [
    ...getAccountTools(actualConnection),
    ...getBudgetTools(actualConnection),
    ...getTransactionTools(actualConnection)
  ];

  tools.forEach(toolConfig => {
    server.addTool(withErrorHandling(toolConfig));
  })
}
