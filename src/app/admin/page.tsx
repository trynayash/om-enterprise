import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { landingPath } from "@/lib/nav";
import { SignInCard } from "../login/sign-in-card";
import { SheetStamp } from "../login/auth-sheet";

export const metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

const card = (
  <SignInCard
    title="Admin sign in"
    description="For the owner and administrators. If you've set a secret key, you'll be asked for it after your password."
    badge={<SheetStamp strong>Admin</SheetStamp>}
  />
);

/** /admin — the owner's sign-in address. Already signed in? Go straight in. */
export default function AdminPage() {
  return (
    <>
      {/* Only the redirect check waits for the session; the form itself renders once, immediately. */}
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      {card}
    </>
  );
}

async function RedirectIfSignedIn() {
  const actor = await getCurrentActor();
  if (actor) redirect(actor.mustChangePassword ? "/account/password?required=1" : landingPath(actor.permissions, actor.isSuperAdmin));
  return null;
}
