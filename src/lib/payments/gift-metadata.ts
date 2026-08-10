/**
 * Gift PaymentIntent metadata kinds accepted by the legacy confirm probe.
 * createPayment writes gift_certificate_purchase; older clients used gift_certificate.
 */
const GIFT_METADATA_KINDS = new Set([
  "gift_certificate_purchase",
  "gift_certificate",
]);

export function isGiftCertificatePaymentKind(
  kind: string | null | undefined,
): boolean {
  return typeof kind === "string" && GIFT_METADATA_KINDS.has(kind);
}
