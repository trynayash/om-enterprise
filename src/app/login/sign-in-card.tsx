import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { PaperSheet, SheetStamp } from "@/components/ui/paper-sheet";

/** Shared sign-in screen for /login (staff) and /admin (owner & administrators). */
export function SignInCard({ title, description, badge }: { title: string; description: string; badge?: ReactNode }) {
  return (
    <PaperSheet
      stamp={badge ?? <SheetStamp>Staff</SheetStamp>}
      footer={
        <>
          Customers:{" "}
          <Link href="/" className="link-draw font-semibold text-navy-900">
            visit our website
          </Link>
        </>
      }
    >
      <h1 className="headline text-[1.625rem] font-bold text-navy-950">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-navy-500">{description}</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </PaperSheet>
  );
}
