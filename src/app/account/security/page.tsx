import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requirePageActor } from "@/server/auth/session";
import { landingPath } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { PageSkeleton } from "@/components/ui/page";
import { SecretKeyForm } from "./secret-key-form";

export const metadata = { title: "Secret key", robots: { index: false } };

export default function SecurityPage(props: PageProps<"/account/security">) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Suspense fallback={<PageSkeleton />}>
          <Security searchParams={props.searchParams} />
        </Suspense>
      </div>
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
        <Link href={home} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      )}
      <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card sm:p-8">
        <SecretKeyForm hasKey={actor.hasSecretKey} setAt={u?.setAt?.toISOString() ?? null} setup={setup} home={home} />
      </div>
    </>
  );
}
