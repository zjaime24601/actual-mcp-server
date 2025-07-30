import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import * as api from "@actual-app/api";
import {
  ToolConfig,
  addCurrencyWarning,
  parameters,
} from "./shared";

// Get account balance history
const getAccountBalanceHistory = function (
  actualConnection: ActualConnection
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
      await actualConnection.ensureBudgetLoaded(args.budgetId);

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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                account,
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

export function getAccountTools(
  actualConnection: ActualConnection
): ToolConfig[] {
  return [getAccountBalanceHistory(actualConnection)];
}
