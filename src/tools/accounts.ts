import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import * as api from "@actual-app/api";
import { ToolConfig, addCurrencyWarning, parameters, withAIContext } from "./shared";
import { ContextService } from "../context/context";

// Get account balance history
const getAccountBalanceHistory = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "get_account_balance_history",
    description: "Get historical account balances for trend analysis",
    parameters: z.object({
      accountId: z.string().describe("Account ID"),
      months: z.number().default(12).describe("Number of months back to check"),
      budgetId: parameters.budgetId(),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded(args.budgetId);

      const account = (await api.getAccounts()).find(
        (acc) => acc.id === args.accountId
      );
      if (!account) {
        throw new Error(`Account ${args.accountId} not found`);
      }

      const history = [];
      for (let i = args.months; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStr = date.toISOString().slice(0, 7);
        const lastDayOfMonth = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0
        );

        const balance =
          (await api.getAccountBalance(args.accountId, lastDayOfMonth)) / 100;
        history.push({
          month: monthStr,
          balance,
          date: lastDayOfMonth.toISOString().split("T")[0],
        });
      }

      const aiContext = await contextService.getContext("account", args.accountId, loadedBudgetId);
      const aiAccountData = aiContext ? withAIContext(account, aiContext) : account;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                account: aiAccountData,
                history,
                queryInfo: {
                  accountId: args.accountId,
                  monthsRequested: args.months,
                  dataPoints: history.length,
                },
              }),
              null,
              2
            ),
          },
        ],
      };
    },
  };
};

const setAccountContext = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "set_account_context",
    description:
      "Set supplementary AI context against Account for future reference. Always ask user to confirm data before setting.",
    parameters: z.object({
      accountId: z.string().describe("Account ID"),
      budgetId: parameters.budgetId(),
      context: z
        .record(z.any())
        .describe(
          "Context data as key-value pairs (e.g., {currency: 'GBP', accountType: 'ISA', notes: 'Emergency fund'})"
        ),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded(
        args.budgetId
      );

      const account = (await api.getAccounts()).find(
        (acc) => acc.id === args.accountId
      );
      if (!account) {
        throw new Error(`Account ${args.accountId} not found`);
      }

      await contextService.setContext(
        "account",
        args.accountId,
        loadedBudgetId,
        args.context
      );

      return {
        content: [
          {
            type: "text",
            text: "Context stored successfully.",
          },
        ],
      };
    },
  };
};

export function getAccountTools(
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig[] {
  return [
    getAccountBalanceHistory(actualConnection, contextService),
    setAccountContext(actualConnection, contextService),
  ];
}
