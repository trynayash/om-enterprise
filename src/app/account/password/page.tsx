import { Suspense } from "react";
import { PaperSheet, SheetStamp } from "@/components/ui/paper-sheet";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password", robots: { index: false } };

export default function PasswordPage() {
  return (
    <PaperSheet stamp={<SheetStamp>Account</SheetStamp>}>
      <Suspense>
        <PasswordForm />
      </Suspense>
    </PaperSheet>
  );
}
