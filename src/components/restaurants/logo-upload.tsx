"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "restaurant-logos";

async function uploadLogoToStorage(params: {
  ownerId: string;
  file: File;
}) {
  const supabase = createClient();
  const extension = params.file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${params.ownerId}/logo.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, params.file, {
    upsert: true,
    contentType: params.file.type || "image/png",
  });

  if (error) {
    return {
      error: `Storage upload failed: ${error.message}`,
      publicUrl: null as string | null,
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { error: null as string | null, publicUrl };
}

async function updateRestaurantLogo(params: {
  ownerId: string;
  logoUrl: string;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({ logo_url: params.logoUrl })
    .eq("owner_id", params.ownerId);

  if (error) {
    return `Restaurant update failed: ${error.message}`;
  }

  return null;
}

export default function RestaurantLogoUpload() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFileChange(file: File | null) {
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be signed in to upload a logo.");
        return;
      }

      const storageResult = await uploadLogoToStorage({ ownerId: user.id, file });
      if (storageResult.error || !storageResult.publicUrl) {
        setError(storageResult.error ?? "Storage upload failed.");
        return;
      }

      const updateError = await updateRestaurantLogo({
        ownerId: user.id,
        logoUrl: storageResult.publicUrl,
      });
      if (updateError) {
        setError(updateError);
        return;
      }

      setSuccess("Logo updated successfully.");
      router.refresh();
    } catch {
      setError("Could not upload logo right now.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor="restaurant-logo-upload"
        className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {uploading ? "Uploading..." : "Upload logo"}
      </label>
      <input
        id="restaurant-logo-upload"
        type="file"
        accept="image/*"
        disabled={uploading}
        className="hidden"
        onChange={(event) =>
          void handleFileChange(event.target.files?.[0] ?? null)
        }
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-700">{success}</p> : null}
    </div>
  );
}
