"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus, ImageOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import type { ImageDTO } from "./types";

export function ImagesManager({ productId, productName, images, canEdit }: { productId: string; productName: string; images: ImageDTO[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name} is larger than 6 MB`);
        const form = new FormData();
        form.append("file", file);
        form.append("alt", alt.trim() || productName);
        const res = await fetch(`/api/admin/products/${productId}/images`, { method: "POST", body: form, credentials: "same-origin" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) throw new ApiError(res.status, json.error?.code ?? "ERROR", json.error?.message ?? "Upload failed", null);
      }
      setAlt("");
      toast(files.length > 1 ? `${files.length} images uploaded` : "Image uploaded");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this image?")) return;
    try {
      await apiFetch(`/api/admin/images/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const order = images.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    try {
      await apiFetch(`/api/admin/products/${productId}/images`, { method: "PUT", body: { order } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader title="Images" description="First image is the main one. JPEG, PNG, WebP or AVIF up to 6 MB — re-encoded and stripped of location data." />
      <CardBody className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {images.length === 0 ? (
          <div className="blueprint flex flex-col items-center gap-2 rounded-lg border border-navy-200 px-4 py-7 text-center text-[13px] leading-relaxed text-navy-500">
            <ImageOff className="h-5 w-5 text-navy-400" aria-hidden />
            No images yet — the website shows a category illustration instead.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {images.map((img, i) => (
              <li key={img.id} className="group relative overflow-hidden rounded-lg border border-navy-100 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by our own upload route */}
                <img src={img.url} alt={img.alt ?? productName} className="aspect-square w-full object-contain" loading="lazy" />
                {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-[3px] bg-navy-900 px-1.5 py-0.5 text-[11px] font-medium text-white">Main</span>}
                {canEdit && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between border-t border-navy-100 bg-white/95 p-0.5">
                    <span className="flex">
                      <button type="button" className="rounded p-1 text-navy-600 hover:bg-navy-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded p-1 text-navy-600 hover:bg-navy-100 disabled:opacity-30" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Move later">
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </span>
                    <button type="button" className="rounded p-1 text-red-700 hover:bg-red-50" onClick={() => remove(img.id)} aria-label="Remove image">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="space-y-2">
            <Input aria-label="Image description (alt text)" placeholder="Describe the image (for accessibility)" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={160} />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" id={`img-${productId}`} onChange={(e) => upload(e.target.files)} />
            <Button variant="outline" className="w-full" loading={busy} icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Upload images
            </Button>
            <p className="text-xs text-navy-500">Only use photos you own or that the manufacturer permits you to use.</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
