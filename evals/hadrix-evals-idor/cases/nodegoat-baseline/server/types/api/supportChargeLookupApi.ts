export type SupportChargeLookupTransactionRecord = Record<string, unknown>;

export interface SupportChargeLookupResponse {
  transaction: SupportChargeLookupTransactionRecord | null;
}

export interface SupportChargeLookupErrorResponse {
  error: string;
}
