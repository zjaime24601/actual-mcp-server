import * as api from "@actual-app/api";
import type { APIAccountEntity } from "@actual-app/api/@types/loot-core/src/server/api-models";
import type { TransactionEntity } from "@actual-app/api/@types/loot-core/src/types/models";

export async function getAccounts(): Promise<APIAccountEntity[]> {
  return api.getAccounts();
}

export async function getAccountBalance(accountId : string, cutoff?: Date): Promise<number> {
  return api.getAccountBalance(accountId, cutoff);
}

export async function getTransaactions(accountId : string, startDate: Date, endDate: Date): Promise<TransactionEntity[]> {
  return api.getTransactions(accountId, startDate, endDate);
}