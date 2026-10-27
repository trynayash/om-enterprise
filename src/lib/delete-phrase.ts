/**
 * What the Super Admin pastes to confirm a deletion: their own username, e.g. "Kishan-Deleting-This".
 * Checked again on the server, so a deletion can't happen by a stray click.
 */
export const deletePhrase = (username: string) => `${username}-Deleting-This`;

/**
 * Why a sale can't be deleted, or null. A sale with money received (net of refunds) stays: that money
 * is turnover the shop declares. Cancel the bill with a refund first, then delete. Practice sales go.
 */
export function deleteBlockedReason(received: string, isTraining: boolean): string | null {
  if (isTraining || !(Number(received) > 0)) return null;
  const amount = `₹${Number(received).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${amount} has been received for this sale, so it can't be deleted. Cancel its bill and refund the customer first (that keeps the GST record right), then delete it.`;
}
