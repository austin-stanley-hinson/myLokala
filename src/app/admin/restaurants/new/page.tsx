"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

const LOGO_BUCKET = "restaurant-logos";

function slugifyName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewRestaurantAdminPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [logoFile]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const { data: insertedRestaurant, error: insertError } = await supabase
        .from("restaurants")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          owner_id: ownerId.trim() || null,
          logo_url: logoUrl.trim() || null,
        })
        .select("id, name")
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      if (logoFile) {
        const extension =
          logoFile.name.split(".").pop()?.toLowerCase() ||
          logoFile.type.split("/").pop() ||
          "png";
        const nameSlug = slugifyName(insertedRestaurant.name || name);
        const uploadPath = `${nameSlug || "business"}/${Date.now()}-logo.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(LOGO_BUCKET)
          .upload(uploadPath, logoFile, {
            upsert: true,
            contentType: logoFile.type || "image/png",
          });

        if (uploadError) {
          setError(
            `Business created, but logo upload failed: ${uploadError.message}`,
          );
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(uploadPath);

        const { error: updateError } = await supabase
          .from("restaurants")
          .update({ logo_url: publicUrl })
          .eq("id", insertedRestaurant.id);

        if (updateError) {
          setError(
            `Business created, but saving logo URL failed: ${updateError.message}`,
          );
          return;
        }
      }

      setName("");
      setDescription("");
      setLocation("");
      setOwnerId("");
      setLogoUrl("");
      setLogoFile(null);
      setFileInputKey((prev) => prev + 1);
      setSuccess(
        logoFile
          ? "Business and logo added successfully."
          : "Business added successfully.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Add Business</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Internal tool for onboarding local businesses
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to Home
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4"
          aria-busy={loading}
        >
          {loading ? (
            <p
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              Saving business...
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Business Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              disabled={loading}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="location" className="text-sm font-medium">
                Location (optional)
              </label>
              <input
                id="location"
                name="location"
                type="text"
                disabled={loading}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ownerId" className="text-sm font-medium">
                Owner ID (optional)
              </label>
              <input
                id="ownerId"
                name="ownerId"
                type="text"
                disabled={loading}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="logoUrl" className="text-sm font-medium">
              Business Logo URL (optional)
            </label>
            <input
              id="logoUrl"
              name="logoUrl"
              type="text"
              disabled={loading}
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="logoFile" className="text-sm font-medium">
              Business logo upload (optional)
            </label>
            <input
              key={fileInputKey}
              id="logoFile"
              name="logoFile"
              type="file"
              accept="image/*"
              disabled={loading}
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              If selected, this upload is stored in Supabase Storage and saved to
              the business logo URL automatically.
            </p>
            {logoPreviewUrl ? (
              <img
                src={logoPreviewUrl}
                alt="Selected business logo preview"
                className="mt-2 h-20 w-20 rounded-md border border-border object-cover"
              />
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
            >
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving..." : "Add business"}
          </button>
        </form>
      </div>
    </div>
  );
}
