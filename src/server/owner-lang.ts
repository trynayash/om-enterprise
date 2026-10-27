import "server-only";
import { cookies } from "next/headers";
import { isOwnerLang, LANG_COOKIE, translator, type OwnerLang, type T } from "@/lib/owner-i18n";

/** The language the owner chose for /admin/app (a cookie on their phone); English until they pick. */
export async function ownerLang(): Promise<{ lang: OwnerLang; t: T }> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isOwnerLang(v) ? v : "en";
  return { lang, t: translator(lang) };
}
