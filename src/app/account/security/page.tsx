import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requirePageActor } from "@/server/auth/session";
import { landingPath } from "@/lib/nav";
import { Skeleton } from "@/components/ui/page";
import { PaperSheet, SheetStamp } from "@/components/ui/paper-sheet";
import { SecretKeyForm } from "./secret-key-form";

export const metadata = { title: "Secret key", robots: { index: false } };

export default function SecurityPage(props: PageProps<"/account/security">) {
  return (
    <PaperSheet stamp={<SheetStamp>Account</SheetStamp>}>
      <Suspense fallback={<FormSkeleton />}>
        <Security searchParams={props.searchParams} />
      </Suspense>
    </PaperSheet>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

async function Security({ searchParams }: { searchParams: PageProps<"/account/security">["searchParams"] }) {
  const actor = await requirePageActor();
  const setup = (await searchParams).setup === "1";
  const [u] = await getDb().select({ setAt: users.loginSecretSetAt }).from(users).where(eq(users.id, actor.id));
  const home = landingPath(actor.permissions, actor.isSuperAdmin);
  return (
    <>
      {!setup && (
        <Link href={home} className="-mt-1 mb-4 inline-flex items-center gap-1 text-sm font-medium text-navy-500 transition-colors hover:text-navy-950">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      )}
      <SecretKeyForm hasKey={actor.hasSecretKey} setAt={u?.setAt?.toISOString() ?? null} setup={setup} home={home} />
    </>
  );
}
