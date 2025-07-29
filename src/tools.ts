import { FastMCP } from "fastmcp";
import { z } from "zod";
import { ActualConnection } from "./actual-connection";
import * as api from "@actual-app/api";

// Utility to convert amounts from Actual's integer format to decimal
// Note: Actual Budget treats all amounts as currency-agnostic numbers
function convertAmounts(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(convertAmounts);
  }

  if (typeof obj === "object") {
    const converted: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Convert amount fields from integer to decimal (divided by 100)
      // These are currency-agnostic - could be USD, GBP, EUR, etc.
      if (
        key === "amount" ||
        key === "balance" ||
        key === "budgeted" ||
        key === "spent"
      ) {
        converted[key] = typeof value === "number" ? value / 100 : value;
      } else {
        converted[key] = convertAmounts(value);
      }
    }
    return converted;
  }

  return obj;
}

// Add currency warning to response data
function addCurrencyWarning(data: any) {
  return {
    IMPORTANT_CURRENCY_NOTE:
      "All amounts are currency-agnostic numbers from Actual Budget. Account names may indicate currency (e.g., 'Barclays GBP', 'Chase USD'). Ask user to specify currencies for accurate financial analysis.",
    ...data,
  };
}

// Error handling decorator for tool functions
function withErrorHandling<T extends z.ZodTypeAny>(toolConfig: {
  name: string;
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<any>;
}) {
  return {
    ...toolConfig,
    execute: async (args: z.infer<T>) => {
      try {
        return await toolConfig.execute(args);
      } catch (error) {
        console.error(`Error in tool ${toolConfig.name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Failed to execute ${toolConfig.name}`,
                  message:
                    error instanceof Error ? error.message : String(error),
                  timestamp: new Date().toISOString(),
                  args: args,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    },
  };
}

export function registerTools(
  server: FastMCP,
  actualConnection: ActualConnection
) {
  // ========================================
  // RAW DATA EXPOSURE TOOLS WITH ERROR HANDLING
  // ========================================

  // List all budgets
  server.addTool(
    withErrorHandling({
      name: "get_budgets",
      description:
        "Get list of all available budget files with raw Actual data",
      parameters: z.object({}),
      execute: async () => {
        await actualConnection.ensureConnection();
        const budgets = await api.getBudgets();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(budgets, null, 2),
            },
          ],
        };
      },
    })
  );

  // Get all raw data needed for comprehensive analysis
  server.addTool(
    withErrorHandling({
      name: "get_all_data",
      description:
        "Get all accounts, categories, category groups, and payees in one call",
      parameters: z.object({
        budgetId: z
          .string()
          .optional()
          .describe(
            "Budget ID to use (uses ACTUAL_BUDGET_ID env var if not provided)"
          ),
      }),
      execute: async (args) => {
        await actualConnection.ensureBudgetLoaded(args.budgetId);

        const [accounts, categories, categoryGroups, payees] =
          await Promise.all([
            api.getAccounts(),
            api.getCategories(),
            api.getCategoryGroups(),
            api.getPayees(),
          ]);

        // Get balances for all accounts
        const accountsWithBalances = await Promise.all(
          accounts.map(async (account) => ({
            ...account,
            balance: (await api.getAccountBalance(account.id)) / 100, // Convert to decimal
          }))
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                addCurrencyWarning({
                  accounts: accountsWithBalances,
                  categories,
                  categoryGroups,
                  payees,
                }),
                null,
                2
              ),
            },
          ],
        };
      },
    })
  );

  // Get transactions with all context data
  server.addTool(
    withErrorHandling({
      name: "get_transactions",
      description:
        "Get transactions for date range with all related data for analysis",
      parameters: z.object({
        startDate: z.string().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().describe("End date (YYYY-MM-DD)"),
        accountId: z
          .string()
          .optional()
          .describe("Specific account ID (gets all accounts if not specified)"),
        budgetId: z
          .string()
          .optional()
          .describe(
            "Budget ID to use (uses ACTUAL_BUDGET_ID env var if not provided)"
          ),
      }),
      execute: async (args) => {
        await actualConnection.ensureBudgetLoaded(args.budgetId);

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
    })
  );

  // Get budget month data
  server.addTool(
    withErrorHandling({
      name: "get_budget_month",
      description:
        "Get budget vs actual data for a specific month with all context",
      parameters: z.object({
        month: z.string().describe("Month in YYYY-MM format"),
        budgetId: z
          .string()
          .optional()
          .describe(
            "Budget ID to use (uses ACTUAL_BUDGET_ID env var if not provided)"
          ),
      }),
      execute: async (args) => {
        await actualConnection.ensureBudgetLoaded(args.budgetId);

        const [budget, categories, categoryGroups] = await Promise.all([
          api.getBudgetMonth(args.month),
          api.getCategories(),
          api.getCategoryGroups(),
        ]);

        // Convert budget amounts to decimal
        const convertedBudget = convertAmounts(budget);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                addCurrencyWarning({
                  budget: convertedBudget,
                  categories,
                  categoryGroups,
                  month: args.month,
                }),
                null,
                2
              ),
            },
          ],
        };
      },
    })
  );

  // Get multiple budget months for trend analysis
  server.addTool(
    withErrorHandling({
      name: "get_budget_months",
      description: "Get budget data for multiple months for trend analysis",
      parameters: z.object({
        startMonth: z.string().describe("Start month in YYYY-MM format"),
        endMonth: z.string().describe("End month in YYYY-MM format"),
        budgetId: z
          .string()
          .optional()
          .describe(
            "Budget ID to use (uses ACTUAL_BUDGET_ID env var if not provided)"
          ),
      }),
      execute: async (args) => {
        await actualConnection.ensureBudgetLoaded(args.budgetId);

        const [categories, categoryGroups] = await Promise.all([
          api.getCategories(),
          api.getCategoryGroups(),
        ]);

        // Generate month list
        const months = [];
        const start = new Date(args.startMonth + "-01");
        const end = new Date(args.endMonth + "-01");

        for (
          let date = new Date(start);
          date <= end;
          date.setMonth(date.getMonth() + 1)
        ) {
          months.push(date.toISOString().slice(0, 7));
        }

        // Get budget data for all months
        const budgetData: Record<string, any> = {};
        for (const month of months) {
          try {
            const budget = await api.getBudgetMonth(month);
            budgetData[month] = convertAmounts(budget);
          } catch (error) {
            budgetData[month] = null; // Month doesn't exist
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                addCurrencyWarning({
                  budgetData,
                  categories,
                  categoryGroups,
                  months,
                  queryInfo: {
                    startMonth: args.startMonth,
                    endMonth: args.endMonth,
                    monthCount: months.length,
                  },
                }),
                null,
                2
              ),
            },
          ],
        };
      },
    })
  );

  // Get account balance history
  server.addTool(
    withErrorHandling({
      name: "get_account_balance_history",
      description: "Get historical account balances for trend analysis",
      parameters: z.object({
        accountId: z.string().describe("Account ID"),
        months: z
          .number()
          .default(12)
          .describe("Number of months back to check"),
        budgetId: z
          .string()
          .optional()
          .describe(
            "Budget ID to use (uses ACTUAL_BUDGET_ID env var if not provided)"
          ),
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
    })
  );
}
