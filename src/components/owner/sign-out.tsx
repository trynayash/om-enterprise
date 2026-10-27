"use client";
import { apiFetch } from "@/lib/api-client";

export function SignOut({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="text-sm font-semibold text-navy-600 underline underline-offset-[3px] hover:text-navy-950"
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
        // Full page load so nothing of this session stays in memory.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/admin";
      }}
    >
      {label}
    </button>
  );
}
