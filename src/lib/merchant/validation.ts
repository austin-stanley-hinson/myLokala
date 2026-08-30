/**
 * Pure input validation for merchant profile and location mutations.
 *
 * These run in Server Actions before the RPCs and in unit tests. The database
 * RPCs repeat the same rules so a bypassed client cannot persist invalid data.
 * Field names match `merchant_accounts` / `merchant_locations` columns only.
 */

export type FieldErrors = Record<string, string>;

export type MerchantProfileInput = {
  displayName: string;
  legalName: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
};

export type MerchantLocationInput = {
  label: string;
  addressText: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  timezone: string;
  status?: string;
};

export type NormalizedProfile = {
  displayName: string;
  legalName: string | null;
  description: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
};

export type NormalizedLocation = {
  label: string;
  addressText: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  status: "active" | "inactive";
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const WEBSITE_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

function trimToNull(value: string, field: string, max: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new Error(`${field} exceeds ${max} characters`);
  }
  return trimmed;
}

function firstMessage(errors: FieldErrors, fallback: string): string {
  const first = Object.values(errors)[0];
  return first ?? fallback;
}

export function validateMerchantProfile(
  input: MerchantProfileInput,
): ValidationResult<NormalizedProfile> {
  const errors: FieldErrors = {};

  const displayName = input.displayName.trim();
  if (!displayName) {
    errors.displayName = "Business name is required.";
  } else if (displayName.length > 120) {
    errors.displayName = "Business name must be 120 characters or fewer.";
  }

  let legalName: string | null = null;
  let description: string | null = null;
  let supportEmail: string | null = null;
  let supportPhone: string | null = null;
  let websiteUrl: string | null = null;

  try {
    legalName = trimToNull(input.legalName, "Legal name", 200);
  } catch {
    errors.legalName = "Legal name must be 200 characters or fewer.";
  }

  try {
    description = trimToNull(input.description, "Description", 2000);
  } catch {
    errors.description = "Description must be 2,000 characters or fewer.";
  }

  try {
    supportPhone = trimToNull(input.supportPhone, "Support phone", 40);
  } catch {
    errors.supportPhone = "Support phone must be 40 characters or fewer.";
  }

  const emailRaw = input.supportEmail.trim();
  if (emailRaw) {
    if (emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) {
      errors.supportEmail = "Enter a valid support email, or leave it blank.";
    } else {
      supportEmail = emailRaw.toLowerCase();
    }
  }

  const websiteRaw = input.websiteUrl.trim();
  if (websiteRaw) {
    if (websiteRaw.length > 500 || !WEBSITE_RE.test(websiteRaw)) {
      errors.websiteUrl =
        "Website must start with http:// or https://, or be left blank.";
    } else {
      websiteUrl = websiteRaw;
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      message: firstMessage(errors, "Please correct the highlighted fields."),
    };
  }

  return {
    ok: true,
    value: {
      displayName,
      legalName,
      description,
      supportEmail,
      supportPhone,
      websiteUrl,
    },
  };
}

export function validateMerchantLocation(
  input: MerchantLocationInput,
): ValidationResult<NormalizedLocation> {
  const errors: FieldErrors = {};

  const label = input.label.trim();
  if (!label) {
    errors.label = "Location name is required.";
  } else if (label.length > 120) {
    errors.label = "Location name must be 120 characters or fewer.";
  }

  const statusRaw = (input.status ?? "active").trim().toLowerCase();
  if (statusRaw !== "active" && statusRaw !== "inactive") {
    errors.status = "A location can be active or inactive.";
  }
  const status: "active" | "inactive" =
    statusRaw === "inactive" ? "inactive" : "active";

  const latRaw = input.latitude.trim();
  const lngRaw = input.longitude.trim();
  let latitude: number | null = null;
  let longitude: number | null = null;

  if (latRaw || lngRaw) {
    if (!latRaw || !lngRaw) {
      errors.latitude =
        "Latitude and longitude must both be provided, or both left blank.";
    } else {
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors.latitude = "Latitude must be a number between -90 and 90.";
      } else {
        latitude = lat;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.longitude = "Longitude must be a number between -180 and 180.";
      } else {
        longitude = lng;
      }
    }
  }

  let addressText: string | null = null;
  let addressLine1: string | null = null;
  let addressLine2: string | null = null;
  let city: string | null = null;
  let region: string | null = null;
  let postalCode: string | null = null;
  let timezone: string | null = null;
  let country = "US";

  try {
    addressText = trimToNull(input.addressText, "Address", 500);
  } catch {
    errors.addressText = "Address must be 500 characters or fewer.";
  }
  try {
    addressLine1 = trimToNull(input.addressLine1, "Address line 1", 200);
  } catch {
    errors.addressLine1 = "Address line 1 must be 200 characters or fewer.";
  }
  try {
    addressLine2 = trimToNull(input.addressLine2, "Address line 2", 200);
  } catch {
    errors.addressLine2 = "Address line 2 must be 200 characters or fewer.";
  }
  try {
    city = trimToNull(input.city, "City", 100);
  } catch {
    errors.city = "City must be 100 characters or fewer.";
  }
  try {
    region = trimToNull(input.region, "State / region", 100);
  } catch {
    errors.region = "State / region must be 100 characters or fewer.";
  }
  try {
    postalCode = trimToNull(input.postalCode, "Postal code", 20);
  } catch {
    errors.postalCode = "Postal code must be 20 characters or fewer.";
  }
  try {
    timezone = trimToNull(input.timezone, "Timezone", 64);
  } catch {
    errors.timezone = "Timezone must be 64 characters or fewer.";
  }

  const countryRaw = input.country.trim();
  if (!countryRaw) {
    country = "US";
  } else if (countryRaw.length !== 2) {
    errors.country = "Country must be a 2-letter code (for example, US).";
  } else {
    country = countryRaw.toUpperCase();
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      message: firstMessage(errors, "Please correct the highlighted fields."),
    };
  }

  return {
    ok: true,
    value: {
      label,
      addressText,
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      country,
      latitude,
      longitude,
      timezone,
      status,
    },
  };
}

export function paymentHubPath(publicCode: string): string {
  return `/pay/${encodeURIComponent(publicCode)}`;
}

export function paymentHubUrl(origin: string, publicCode: string): string {
  return `${origin.replace(/\/$/, "")}${paymentHubPath(publicCode)}`;
}

/** Map a Postgres/PostgREST error into a safe user-facing sentence. */
export function merchantSetupErrorMessage(error: {
  message?: string | null;
}): string {
  const message = (error.message ?? "").trim();
  const lower = message.toLowerCase();

  if (!message) return "Something went wrong. Please try again.";
  if (lower.includes("authentication required")) {
    return "Please sign in to continue.";
  }
  if (lower.includes("not authorized")) {
    return "You don't have permission to change this.";
  }
  if (lower.includes("display_name is required")) {
    return "Business name is required.";
  }
  if (lower.includes("label is required")) {
    return "Location name is required.";
  }
  if (lower.includes("support_email")) {
    return "Enter a valid support email, or leave it blank.";
  }
  if (lower.includes("website_url")) {
    return "Website must start with http:// or https://, or be left blank.";
  }
  if (lower.includes("latitude and longitude")) {
    return "Latitude and longitude must both be provided, or both left blank.";
  }
  if (lower.includes("location is not active")) {
    return "Reactivate this location to create its payment QR code.";
  }
  if (lower.includes("not accepting location changes")) {
    return "This business isn't able to add or change locations right now.";
  }
  if (lower.includes("status must be")) {
    return "A location can be active or inactive.";
  }
  if (lower.includes("exceeds")) {
    return "One of the fields is too long. Please shorten it and try again.";
  }

  // Never surface SQL/PostgREST internals or schema names.
  if (
    lower.includes("schema cache") ||
    lower.includes("permission denied") ||
    lower.includes("violates")
  ) {
    return "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
