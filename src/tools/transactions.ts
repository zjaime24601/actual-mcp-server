import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import {
  ToolConfig,
  addCurrencyWarning,
  parameters,
} from "./shared";
import {
  integerToAmount,
  getAccounts,
  getTransactions,
  getCategories,
  getPayees,
} from "../actual-api";
import {
  APICategoryEntity,
  APIPayeeEntity,
} from "@actual-app/api/@types/loot-core/src/server/api-models";
import { TransactionEntity } from "@actual-app/api/@types/loot-core/src/types/models";

const mapResponseTransaction = function (
  actualTransaction: TransactionEntity,
  categoryMap: Record<string, APICategoryEntity>,
  payeeMap: Record<string, APIPayeeEntity>
): any {
  return {
    id: actualTransaction.id,
    accountId: actualTransaction.account,
    date: actualTransaction.date,
    payee: actualTransaction.payee
      ? payeeMap[actualTransaction.payee]?.name
      : null,
    category: actualTransaction.category
      ? categoryMap[actualTransaction.category]?.name
      : null,
    amount: integerToAmount(actualTransaction.amount),
    notes: actualTransaction.notes,
    isCleared: actualTransaction.cleared,
    subtransactions: actualTransaction?.subtransactions?.map((t) =>
      mapResponseTransaction(t, categoryMap, payeeMap)
    ),
  };
};

const getTransactionsTool = function (
  actualConnection: ActualConnection
): ToolConfig {
  const getTransactionsSchema = z.object({
    startDate: parameters.date("Start date"),
    endDate: parameters.date("End date"),
    limit: z
      .coerce
      .number()
      .optional()
      .describe(
        "Maximum number of transactions to be returned. Useful for determining if there was any account activity in a given time period."
      ),
    accountId: z
      .string()
      .optional()
      .describe("Specific account ID (gets all accounts if not specified)"),
  });

  type GetTransactionsArgs = z.infer<typeof getTransactionsSchema>;

  return {
    name: "get_transactions",
    description:
      "Get transactions for date range with all related data for analysis",
    parameters: getTransactionsSchema,
    execute: async (args: GetTransactionsArgs) => {
      await actualConnection.ensureBudgetLoaded();

      const startDate = new Date(args.startDate);
      const endDate = new Date(args.endDate);
      const accounts = await getAccounts();
      const targetAccounts = args.accountId
        ? accounts.filter((acc) => acc.id === args.accountId)
        : accounts;
      const accountTransactions = (
        await Promise.all(
          targetAccounts.map(
            async (account) =>
              await getTransactions(account.id, startDate, endDate)
          )
        )
      )
        .flat()
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      const requestedTransactions = args.limit
        ? accountTransactions.slice(0, args.limit)
        : accountTransactions;

      const [categories, payees] = await Promise.all([
        getCategories().then((cats) =>
          cats.reduce((acc: Record<string, APICategoryEntity>, cat) => {
            acc[cat.id] = cat;
            return acc;
          }, {})
        ),
        getPayees().then((p) =>
          p.reduce((acc: Record<string, APIPayeeEntity>, payee) => {
            acc[payee.id] = payee;
            return acc;
          }, {})
        ),
      ]);

      const responseTransactions = requestedTransactions.map((t) => mapResponseTransaction(t, categories, payees));;
      // Filter accounts to only include those with transactions in the response
      const relevantAccountIds = new Set(requestedTransactions.map(t => t.account));
      const relevantAccounts = accounts.filter(acc => relevantAccountIds.has(acc.id));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                transactions: responseTransactions,
                relevantAccounts,
                queryInfo: {
                  startDate: args.startDate,
                  endDate: args.endDate,
                  accountId: args.accountId,
                  transactionCount: responseTransactions.length,
                },
              })
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
  return [getTransactionsTool(actualConnection)];
}
