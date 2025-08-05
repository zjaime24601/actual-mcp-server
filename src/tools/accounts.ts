import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import {
  ToolConfig,
  addCurrencyWarning,
  parameters,
  withAIContext,
} from "./shared";
import { ContextService } from "../context/context";
import {
  integerToAmount,
  getAccounts,
  getAccountBalance,
  getTransactions,
} from "../actual-api";

const getAccountsTool = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "get_accounts",
    description: "Get accounts for budget",
    parameters: z.object({}),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const accounts = await getAccounts();

      if (!accounts) {
        throw new Error(`Account ${args.accountId} not found`);
      }

      const responseAccounts = await Promise.all(
        accounts.map(async (a) => {
          const balance = await getAccountBalance(a.id);
          const mappedAccount = {
            ...a,
            currentBalance: integerToAmount(balance),
          };
          const aiContext = await contextService.getContext(
            "account",
            a.id,
            loadedBudgetId
          );
          return aiContext
            ? withAIContext(mappedAccount, aiContext)
            : mappedAccount;
        })
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                accounts: responseAccounts,
              })
            ),
          },
        ],
      };
    },
  };
};

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
      startDate: parameters.date("Start date"),
      endDate: parameters.date("End date"),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const account = (await getAccounts()).find(
        (acc) => acc.id === args.accountId
      );
      if (!account) {
        throw new Error(`Account ${args.accountId} not found`);
      }

      const history = [];
      const endDate = new Date(args.endDate);
      const startDate = new Date(args.startDate);
      const currentDate = new Date(startDate);
      const dayBefore = new Date(currentDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      let dayBeforeBalance = await getAccountBalance(account.id, dayBefore);

      const transactions = await getTransactions(
        account.id,
        currentDate,
        endDate
      );
      const groupedTransactions = Object.groupBy(transactions, (t) => t.date);
      while (currentDate < endDate) {
        const currentDayBalance = await getAccountBalance(
          account.id,
          currentDate
        );

        const currentDateStr = currentDate.toISOString().split("T")[0] || "";
        const currentDayTransactions = groupedTransactions[currentDateStr];

        const positiveDayAmounts =
          currentDayTransactions?.reduce(
            (acc, t) => (!!t.amount && t.amount > 0 ? acc + t.amount : acc),
            0
          ) || 0;

        history.push({
          date: currentDateStr,
          endOfDayBalance: integerToAmount(currentDayBalance),
          theoreticalPeakIntradayBalance: integerToAmount(dayBeforeBalance + positiveDayAmounts),
        });

        dayBeforeBalance = currentDayBalance;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const aiContext = await contextService.getContext(
        "account",
        args.accountId,
        loadedBudgetId
      );
      const aiAccountData = aiContext
        ? withAIContext(account, aiContext)
        : account;

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
                  daysRequested: Math.ceil(
                    (endDate.getTime() - startDate.getTime()) /
                      (1000 * 60 * 60 * 24)
                  ),
                  dataPoints: history.length,
                },
                fieldDefinitions: {
                  endOfDayBalance: "Actual account balance at end of day",
                  theoreticalPeakIntradayBalance:
                    "Previous day's end balance plus current day's positive transactions - useful for FBAR compliance and overdraft analysis. This balance may never have actually existed.",
                },
              })
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
      context: z
        .record(z.any())
        .describe(
          "Context data as key-value pairs (e.g., {currency: 'GBP', accountType: 'ISA', notes: 'Emergency fund'})"
        ),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const account = (await getAccounts()).find(
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
    getAccountsTool(actualConnection, contextService),
    getAccountBalanceHistory(actualConnection, contextService),
    setAccountContext(actualConnection, contextService),
  ];
}
