import type { getSale, refreshDraft } from "@/server/services/sales";
import type { SellableVariant } from "@/server/services/catalog";
import type { PublicActor } from "@/server/auth/actor";

/** Shape of a value after a JSON round-trip (Dates become ISO strings). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type SaleData = Jsonify<Awaited<ReturnType<typeof getSale>>> & {
  evaluation: Jsonify<Awaited<ReturnType<typeof refreshDraft>>>;
};
export type SaleJson = SaleData["sale"];
export type SaleLineJson = SaleData["lines"][number];
export type PaymentJson = SaleData["payments"][number];
export type Evaluation = NonNullable<SaleData["evaluation"]>;
export type SearchResult = SellableVariant;
export type Me = PublicActor;

export interface PosUnit {
  code: string;
  name: string;
  decimals: number;
}

/** Non-secret settings the counter screen needs. */
export interface PosConfig {
  registrationType: "regular" | "composition" | "unregistered" | null;
  businessName: string;
  businessStateCode: string;
  b2cDetailsThreshold: string;
  payments: {
    upiEnabled: boolean;
    upiVpa: string;
    gatewayProvider: "none" | "razorpay";
    cashEnabled: boolean;
    cardEnabled: boolean;
    bankTransferEnabled: boolean;
    chequeEnabled: boolean;
    maxPerUpiPayment: string;
    requireUpiReference: boolean;
  };
  discounts: {
    requireReasonForAnyDiscount: boolean;
    inPersonApprovalEnabled: boolean;
    allowCreditSales: boolean;
  };
}

export function hasPerm(me: Me, p: string) {
  return me.isSuperAdmin || me.permissions.includes(p);
}
