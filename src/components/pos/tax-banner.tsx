/** Explains why real (non-training) sales cannot be completed yet. */
export function TaxBanner({ registrationType, isTraining }: { registrationType: string | null; isTraining?: boolean }) {
  if (registrationType !== null || isTraining) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 border-l-[3px] border-l-amber-500 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-950" role="status">
      <div className="font-semibold">GST registration not confirmed — only training sales can be completed.</div>
      <div className="mt-0.5 text-amber-900">
        You can build carts and quotations, but real bills can&apos;t be issued yet. Ask the Super Admin to configure{" "}
        <span className="font-semibold">Settings → Tax</span>.
      </div>
    </div>
  );
}

export function TrainingBanner() {
  return (
    <div
      className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 rounded-lg border border-red-200 border-l-[3px] border-l-red-600 bg-red-50/70 px-4 py-2.5 text-sm leading-relaxed text-red-950"
      role="status"
    >
      <span className="shrink-0 rounded-[3px] bg-red-700 px-1.5 py-[3px] font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-white">
        Training sale
      </span>
      <span className="min-w-0 flex-1">
        This cart contains <b>SAMPLE</b> products. Its bill is numbered separately (TRN/…), watermarked &ldquo;not a valid bill&rdquo; and excluded from all
        reports.
      </span>
    </div>
  );
}
