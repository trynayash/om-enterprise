"use client";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, LANG_NAMES, OWNER_LANGS, type OwnerLang } from "@/lib/owner-i18n";
import { cn } from "@/components/ui/cn";

/** Remembered on this phone for a year. */
function saveLang(l: OwnerLang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

/** English / ગુજરાતી / हिन्दी for the owner app. */
export function LangSwitch({ lang, label }: { lang: OwnerLang; label: string }) {
  const router = useRouter();
  const pick = (l: OwnerLang) => {
    saveLang(l);
    router.refresh();
  };
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-navy-200 bg-white p-0.5 text-[13px]">
      {OWNER_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === lang}
          onClick={() => pick(l)}
          className={cn("rounded-md px-2.5 py-1.5 font-semibold transition-colors", l === lang ? "bg-navy-900 text-white" : "text-navy-600 hover:text-navy-950")}
        >
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
