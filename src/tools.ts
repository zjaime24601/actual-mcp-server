import { FastMCP } from "fastmcp";
import { ActualConnection } from "./actual-connection";
import { withErrorHandling } from "./tools/shared";
import { getBudgetTools } from "./tools/budgets";
import { getTransactionTools } from "./tools/transactions";
import { getAccountTools } from "./tools/accounts";
import { ContextService } from "./context/context";
import { getOwnerTools } from "./tools/owner";

export function registerTools(
  server: FastMCP,
  actualConnection: ActualConnection,
  contextService: ContextService
) {
  const tools = [
    ...getOwnerTools(actualConnection, contextService),
    ...getAccountTools(actualConnection, contextService),
    ...getBudgetTools(actualConnection),
    ...getTransactionTools(actualConnection),
  ];

  tools.forEach((toolConfig) => {
    server.addTool(withErrorHandling(toolConfig));
  });
  
  return tools;
}
