"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const LOGO_BUCKET = "restaurant-logos";

type RestaurantRecord = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  logo_url: string | null;
};

export default function EditRestaurantAdminPage() {
  const params = useParams<{ id: string }>();
  const restaurantId = params.id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [loadingRestaurant, setLoadingRestaurant] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRestaurant() {
      setLoadingRestaurant(true);
      setError(null);

      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("restaurants")
          .select("id, name, description, location, logo_url")
          .eq("id", restaurantId)
          .maybeSingle();

        if (fetchError) {
          if (!cancelled) setError(fetchError.message);
          return;
        }

        if (!data) {
          if (!cancelled) setError("Business not found.");
          return;
        }

        if (cancelled) return;

        const restaurant = data as RestaurantRecord;
        setName(restaurant.name ?? "");
        setDescription(restaurant.description ?? "");
        setLocation(restaurant.location ?? "");
        setLogoUrl(restaurant.logo_url ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load business. Try again.",
          );
        }
      } finally {
        if (!cancelled) setLoadingRestaurant(false);
      }
    }

    if (restaurantId) {
      void loadRestaurant();
    }

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

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
    setSaving(true);

    try {
      const supabase = createClient();
      let nextLogoUrl = logoUrl.trim() || null;

      if (logoFile) {
        const extension =
          logoFile.name.split(".").pop()?.toLowerCase() ||
          logoFile.type.split("/").pop() ||
          "png";
        const uploadPath = `${restaurantId}/logo-${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(LOGO_BUCKET)
          .upload(uploadPath, logoFile, {
            upsert: true,
            contentType: logoFile.type || "image/png",
          });

        if (uploadError) {
          setError(`Logo upload failed: ${uploadError.message}`);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(uploadPath);
        nextLogoUrl = publicUrl;
      }

      const { error: updateError } = await supabase
        .from("restaurants")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          logo_url: nextLogoUrl,
        })
        .eq("id", restaurantId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setLogoUrl(nextLogoUrl ?? "");
      setLogoFile(null);
      setSuccess("Business updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Edit Business</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Internal tool for updating business details
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to Home
          </Link>
        </div>

        {loadingRestaurant ? (
          <p className="mt-6 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Loading business...
          </p>
        ) : null}

        {error && loadingRestaurant ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!loadingRestaurant ? (
          <form
            onSubmit={handleSubmit}
            className="mt-8 grid gap-4"
            aria-busy={saving}
          >
            {saving ? (
              <p
                className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
                aria-live="polite"
              >
                Saving changes...
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
                disabled={saving}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                disabled={saving}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="location" className="text-sm font-medium">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                disabled={saving}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="logoUrl" className="text-sm font-medium">
                Business Logo URL
              </label>
              <input
                id="logoUrl"
                name="logoUrl"
                type="text"
                disabled={saving}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="logoFile" className="text-sm font-medium">
                Upload/replace business logo (optional)
              </label>
              <input
                id="logoFile"
                name="logoFile"
                type="file"
                accept="image/*"
                disabled={saving}
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {logoPreviewUrl ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Selected business logo preview</p>
                <img
                  src={logoPreviewUrl}
                  alt="Selected business logo preview"
                  className="h-20 w-20 rounded-md border border-border object-cover"
                />
              </div>
            ) : logoUrl ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Current business logo preview</p>
                <img
                  src={logoUrl}
                  alt="Current business logo"
                  className="h-20 w-20 rounded-md border border-border object-cover"
                />
              </div>
            ) : null}

            {error && !loadingRestaurant ? (
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
              disabled={saving}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
