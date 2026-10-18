"use client";
import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { errorMessage } from "@/lib/api-client";

/** Asks for a reason before a sensitive action (cancel, reopen, request approval…). */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label = "Reason",
  confirmLabel,
  confirmVariant = "primary",
  minLength = 3,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  label?: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger" | "gold";
  minLength?: number;
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Back
          </Button>
          <Button variant={confirmVariant} loading={busy} disabled={reason.trim().length < minLength} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={label} htmlFor="reason-text" required hint={minLength > 1 ? `At least ${minLength} characters` : undefined}>
          <Textarea id="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
        </Field>
      </div>
    </Dialog>
  );
}
