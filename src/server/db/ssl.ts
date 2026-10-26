/**
 * The database host's `sslmode` written out so the driver stops warning about it. `prefer`, `require`
 * and `verify-ca` have always behaved as `verify-full` in this driver, and a coming version will give
 * them the weaker meaning other tools use; naming `verify-full` keeps today's behaviour for good and
 * silences the notice that was printed on every cold start.
 */
export function withExplicitSsl(url: string): string {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
}
