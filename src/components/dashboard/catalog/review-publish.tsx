"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_review", label: "Pending review" },
  { key: "approved", label: "Reviewed" },
] as const;

export function ReviewPublish({
  productId,
  slug,
  reviewStatus,
  isPublished,
  isActive,
  activeVariantCount,
  canEdit,
  canPublish,
}: {
  productId: string;
  slug: string;
  reviewStatus: "draft" | "pending_review" | "approved";
  isPublished: boolean;
  isActive: boolean;
  activeVariantCount: number;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, path: string, body: unknown, msg: string) => {
    setBusy(key);
    setError(null);
    try {
      await apiFetch(path, { method: "POST", body });
      toast(msg);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const review = (status: string, msg: string) => run(status, `/api/admin/products/${productId}/review`, { status }, msg);
  const stepIndex = STEPS.findIndex((s) => s.key === reviewStatus);
  const publishBlocker =
    reviewStatus !== "approved" ? "Mark the information as reviewed first." : !isActive ? "Activate the product first." : activeVariantCount === 0 ? "Add at least one active variant." : null;

  return (
    <Card>
      <CardHeader title="Review & website" description="Nothing appears on the website until it has been reviewed and published." />
      <CardBody className="space-y-4">
        <ol className="grid grid-cols-3 gap-1.5" aria-label="Review progress">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || (i === 2 && stepIndex === 2);
            const current = i === stepIndex;
            return (
              <li key={s.key} aria-current={current ? "step" : undefined}>
                <span aria-hidden className={`block h-[3px] rounded-full ${i <= stepIndex ? (i === 2 ? "bg-emerald-600" : "bg-navy-900") : "bg-navy-100"}`} />
                <span className={`mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold leading-tight ${current ? "text-navy-900" : i < stepIndex ? "text-navy-600" : "text-navy-400"}`}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden /> : <span className="font-mono text-[10.5px] font-medium">{i + 1}</span>}
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between border-y border-navy-100 py-2.5">
          <span className="label-mono text-navy-500">Website</span>
          {isPublished ? <Badge tone="green">Published</Badge> : <Badge>Not published</Badge>}
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-col gap-2">
          {reviewStatus === "draft" && canEdit && (
            <Button variant="outline" loading={busy === "pending_review"} icon={<Send className="h-4 w-4" />} onClick={() => review("pending_review", "Sent for review")}>
              Submit for review
            </Button>
          )}
          {reviewStatus !== "approved" && canPublish && (
            <Button variant="gold" loading={busy === "approved"} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => review("approved", "Marked as reviewed")}>
              Mark information as reviewed
            </Button>
          )}
          {reviewStatus === "approved" && canEdit && (
            <Button variant="ghost" loading={busy === "draft"} icon={<Undo2 className="h-4 w-4" />} onClick={() => review("draft", "Moved back to draft (and hidden from the website)")}>
              Move back to draft
            </Button>
          )}
          {canPublish &&
            (isPublished ? (
              <Button variant="outline" loading={busy === "unpublish"} icon={<EyeOff className="h-4 w-4" />} onClick={() => run("unpublish", `/api/admin/products/${productId}/publish`, { publish: false }, "Hidden from the website")}>
                Unpublish from website
              </Button>
            ) : (
              <Button
                loading={busy === "publish"}
                disabled={!!publishBlocker}
                icon={<Eye className="h-4 w-4" />}
                onClick={() => run("publish", `/api/admin/products/${productId}/publish`, { publish: true }, "Published on the website")}
              >
                Publish on website
              </Button>
            ))}
          {!isPublished && canPublish && publishBlocker && <p className="text-xs text-navy-500">{publishBlocker}</p>}
          {isPublished && (
            <a href={`/products/${slug}`} target="_blank" rel="noopener noreferrer" className="mt-1 text-center text-[13px] font-semibold text-gold-700 underline-offset-[3px] hover:underline">
              View on website ↗
            </a>
          )}
        </div>
        <p className="text-xs leading-relaxed text-navy-500">
          Changing the name, description, specifications, HSN, GST class, warranty or unit of a reviewed product sends it back for review. It stays on the website until someone unpublishes it.
        </p>
      </CardBody>
    </Card>
  );
}
