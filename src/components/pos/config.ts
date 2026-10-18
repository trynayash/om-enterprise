import "server-only";
import { getAllSettings } from "@/server/settings";
import { listUnits } from "@/server/services/catalog";
import type { PosConfig, PosUnit } from "./types";

/** Only non-secret settings needed at the counter. */
export async function loadPosConfig(): Promise<PosConfig> {
  const s = await getAllSettings();
  return {
    registrationType: s.tax.registrationType,
    businessName: s.business.name,
    businessStateCode: s.business.stateCode,
    b2cDetailsThreshold: s.tax.b2cDetailsThreshold,
    payments: {
      upiEnabled: s.payments.upiEnabled,
      upiVpa: s.payments.upiVpa,
      gatewayProvider: s.payments.gatewayProvider,
      cashEnabled: s.payments.cashEnabled,
      cardEnabled: s.payments.cardEnabled,
      bankTransferEnabled: s.payments.bankTransferEnabled,
      chequeEnabled: s.payments.chequeEnabled,
      maxPerUpiPayment: s.payments.maxPerUpiPayment,
      requireUpiReference: s.payments.requireUpiReference,
    },
    discounts: {
      requireReasonForAnyDiscount: s.discounts.requireReasonForAnyDiscount,
      inPersonApprovalEnabled: s.discounts.inPersonApprovalEnabled,
      allowCreditSales: s.discounts.allowCreditSales,
    },
  };
}

export async function loadPosUnits(): Promise<PosUnit[]> {
  return (await listUnits()).map((u) => ({ code: u.code, name: u.name, decimals: u.decimals }));
}

/** Plain JSON copy (Dates → ISO strings) so server data matches the API's shape on the client. */
export function toJson<T>(v: T) {
  return JSON.parse(JSON.stringify(v));
}
