import { api } from "@/server/http";
import { getPayment } from "@/server/services/payments";

/** Polled by the POS while a gateway QR is open. */
export const GET = api({ permission: ["payments.record", "payments.view"] }, async ({ actor, params }) => getPayment(actor, params.id));
