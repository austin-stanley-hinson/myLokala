"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Printer } from "lucide-react";

/**
 * Client-only QR rendering for a payment-hub URL. Ownership and get-or-create
 * stay on the server; this only visualizes the public `/pay/{code}` link.
 * State updates happen in promise callbacks, not synchronously in the effect.
 */
export function PaymentHubQrPanel({
  paymentUrl,
  businessName,
}: {
  paymentUrl: string;
  businessName: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(paymentUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#4b2112",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        setRenderError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setDataUrl(null);
        setRenderError(
          "Could not draw the QR image. You can still copy the payment link below.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [paymentUrl]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleDownload() {
    if (!dataUrl) return;
    const anchor = document.createElement("a");
    const safeName = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    anchor.href = dataUrl;
    anchor.download = `lokala-qr-${safeName || "business"}.png`;
    anchor.click();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="mt-5 grid gap-6 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="mx-auto flex flex-col items-center gap-3 print:mx-0">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from qrcode
          <img
            src={dataUrl}
            alt={`Lokala payment QR code for ${businessName}`}
            width={280}
            height={280}
            className="rounded-2xl border border-lokala-border bg-white p-2"
          />
        ) : renderError ? (
          <div className="flex size-[280px] items-center justify-center rounded-2xl border border-dashed border-lokala-border bg-lokala-cream p-4 text-center text-sm text-lokala-muted">
            {renderError}
          </div>
        ) : (
          <div className="flex size-[280px] items-center justify-center rounded-2xl border border-lokala-border bg-lokala-cream text-sm text-lokala-muted">
            Preparing QR code…
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-lokala-green-dark">
            Payment link
          </p>
          <p className="mt-2 break-all rounded-2xl border border-lokala-border bg-lokala-cream px-3 py-2.5 text-sm font-semibold text-lokala-brown-dark">
            {paymentUrl}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap print:hidden">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-lokala-green px-4 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
          >
            <Copy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!dataUrl}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-lokala-border bg-white px-4 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden />
            Download PNG
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-lokala-border bg-white px-4 py-2.5 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
          >
            <Printer className="size-4" aria-hidden />
            Print
          </button>
        </div>

        <ul className="space-y-1.5 text-sm leading-6 text-lokala-muted">
          <li>Print this QR code and place it near checkout.</li>
          <li>
            Paying with Lokala balance will be enabled in the upcoming payment
            phase. The code itself is permanent and does not depend on Stripe.
          </li>
          <li>Staff do not need to download Lokala to accept a scan.</li>
        </ul>
      </div>
    </div>
  );
}
