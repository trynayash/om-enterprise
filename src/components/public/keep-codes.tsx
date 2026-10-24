import { Fragment } from "react";

/** A product name whose model codes ("MFLT-101", "EC-0202") stay on one line instead of breaking at the hyphen. */
export function KeepCodes({ text }: { text: string }) {
  return text
    .split(/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)/)
    .map((part, i) =>
      i % 2 === 1 && /\d/.test(part) ? (
        <span key={i} className="whitespace-nowrap">
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}
