import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import * as api from "@actual-app/api";
import { ToolConfig, addCurrencyWarning, convertAmounts, parameters } from "./shared";

  // Get transactions with all context data
const getTransactions = function (actualConnection: ActualConnection): ToolConfig {
  return {
        name: "get_transactions",
        description:
          "Get transactions for date range with all related data for analysis",
        parameters: z.object({
          startDate: parameters.date("Start date"),
          endDate: parameters.date("End date"),
          limit: z.number()
          .optional()
          .describe("Maximum number of transactions to be returned. Useful for determining if there was any account activity in a given time period."),
          accountId: z
            .string()
            .optional()
            .describe("Specific account ID (gets all accounts if not specified)"),
        }),
        execute: async (args) => {
          await actualConnection.ensureBudgetLoaded();
  
          const [accounts, categories, categoryGroups, payees] =
            await Promise.all([
              api.getAccounts(),
              api.getCategories(),
              api.getCategoryGroups(),
              api.getPayees(),
            ]);
  
          const targetAccounts = args.accountId
            ? accounts.filter((acc) => acc.id === args.accountId)
            : accounts;
  
          let allTransactions = [];
  
          for (const account of targetAccounts) {
            const transactions = await api.getTransactions(
              account.id,
              args.startDate,
              args.endDate
            );
            allTransactions.push(...transactions);
          }
  
          // Convert amounts to decimal for easier analysis
          allTransactions = convertAmounts(allTransactions);
  
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  addCurrencyWarning({
                    transactions: allTransactions,
                    accounts,
                    categories,
                    categoryGroups,
                    payees,
                    queryInfo: {
                      startDate: args.startDate,
                      endDate: args.endDate,
                      accountId: args.accountId,
                      transactionCount: allTransactions.length,
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

export function getTransactionTools(
  actualConnection: ActualConnection
): ToolConfig[] {
  return [
    getTransactions(actualConnection)
  ];
}