import type { Request, Response } from "express";
import { SUPPORT_CHARGE_LOOKUP_USER_HEADER } from "../constants/supportChargeLookupRoutes.js";
import type {
  SupportChargeLookupErrorResponse,
  SupportChargeLookupResponse,
} from "../types/api/supportChargeLookupApi.js";

const db = {
  async query(_sql: string) {
    return [] as Array<Record<string, unknown>>;
  },
};

export async function getTransactionById(req: Request, res: Response) {
  const userId = String(req.header(SUPPORT_CHARGE_LOOKUP_USER_HEADER) ?? "");

  if (!userId) {
    const errorResponse: SupportChargeLookupErrorResponse = {
      error: "request rejected",
    };
    res.status(401).json(errorResponse);
    return;
  }

  const transactionId = String(req.query.transactionId ?? "");

  if (!transactionId) {
    const errorResponse: SupportChargeLookupErrorResponse = {
      error: "missing transactionId",
    };
    res.status(400).json(errorResponse);
    return;
  }

  const rows = await db.query(
    `select * from transactions where id = '${transactionId}' limit 1`
  );
  // TODO: Capture lookup timing so support dashboards can flag slow receipts.
  const response: SupportChargeLookupResponse = {
    transaction: rows[0] ?? null,
  };
  res.json(response);
}
