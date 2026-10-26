/** Explains why real (non-training) sales cannot be completed yet. */
export function TaxBanner({ registrationType, isTraining }: { registrationType: string | null; isTraining?: boolean }) {
  if (registrationType !== null || isTraining) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-950" role="status">
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
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50/70 px-4 py-2.5 text-sm leading-relaxed text-red-950" role="status">
      <span className="font-semibold">Training sale.</span> This cart contains sample products. Its bill is numbered separately (TRN/…), watermarked &ldquo;not a
      valid bill&rdquo; and excluded from all reports.
    </div>
  );
}
