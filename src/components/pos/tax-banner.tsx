import { AlertTriangle } from "lucide-react";

/** Explains why real (non-training) sales cannot be completed yet. */
export function TaxBanner({ registrationType, isTraining }: { registrationType: string | null; isTraining?: boolean }) {
  if (registrationType !== null || isTraining) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <div className="font-bold">GST registration not confirmed — only training sales can be completed.</div>
        <div className="mt-0.5 text-amber-800">
          You can build carts and quotations, but real bills can&apos;t be issued yet. Ask the Super Admin to configure{" "}
          <span className="font-semibold">Settings → Tax</span>.
        </div>
      </div>
    </div>
  );
}

export function TrainingBanner() {
  return (
    <div className="mb-4 rounded-2xl border-2 border-dashed border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900" role="status">
      <span className="mr-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Training sale</span>
      This cart contains <b>SAMPLE</b> products. Its bill is numbered separately (TRN/…), watermarked &ldquo;not a valid bill&rdquo; and excluded from all
      reports.
    </div>
  );
}
