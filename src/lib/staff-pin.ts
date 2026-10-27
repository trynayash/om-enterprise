/**
 * Counter PINs: a short number staff at the counter sign in with instead of their password. Only for
 * the Sales and Accountant roles; the Super Admin and administrators always use their password. Wrong
 * PINs count towards the same lockout as wrong passwords, so a PIN can't be guessed freely.
 */
export const PIN_ROLES = ["sales", "accountant"] as const;

export const pinAllowedFor = (roleKey: string) => (PIN_ROLES as readonly string[]).includes(roleKey);

/** Why a PIN won't do, in words for the form, or null. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "A PIN is 4 to 6 digits.";
  if (/^(\d)\1+$/.test(pin)) return "Use different digits, not the same one repeated.";
  const up = "01234567890";
  const down = "09876543210";
  if (up.includes(pin) || down.includes(pin)) return "Avoid a run like 1234 — it's the first PIN anyone tries.";
  if (["1212", "2580", "0852", "1122", "2468", "1357", "6969", "4545"].includes(pin)) return "That PIN is too common. Choose another.";
  return null;
}
