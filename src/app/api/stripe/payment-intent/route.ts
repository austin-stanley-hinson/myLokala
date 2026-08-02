import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { amount, businessId } = await req.json();
    const supabase = await createClient();

    let ownerId = businessId;

    // 1. Determine if businessId is a UUID or a new public_code
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId);

    if (isUuid) {
      // Legacy check: Look up owner_id from legacy businesses table
      const { data: business } = await supabase
        .from("businesses")
        .select("owner_id")
        .eq("id", businessId)
        .maybeSingle();

      if (business?.owner_id) {
        ownerId = business.owner_id;
      }
    } else {
      // New flow: businessId is actually a public_code from the QR.
      // Try to look up the owner_id from business_qr_codes
      const { data: qrData } = await supabase
        .from("business_qr_codes")
        .select("business_owner_id")
        .eq("public_code", businessId)
        .eq("is_active", true)
        .maybeSingle();
        
      if (qrData?.business_owner_id) {
        ownerId = qrData.business_owner_id;
      } else {
        // Fallback to RPC if direct table read is blocked by RLS
        const { data: rpcData } = await supabase.rpc("get_business_for_qr_code", {
          input_public_code: businessId,
        });
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (row?.business_owner_id || row?.owner_id) {
          ownerId = row.business_owner_id || row.owner_id;
        }
      }
    }

    // 2. Look up the Stripe Connected Account for this owner_id
    let connectedAccountId = null;
    if (ownerId) {
      const { data: paymentAccount } = await supabase
        .from("business_payment_accounts")
        .select("stripe_account_id")
        .eq("owner_id", ownerId)
        .maybeSingle();
      
      connectedAccountId = paymentAccount?.stripe_account_id;
    }

    const stripe = getStripe();

    // 3. Create the payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      ...(connectedAccountId
        ? {
            transfer_data: {
              destination: connectedAccountId,
            },
          }
        : {}),
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create payment intent.";
    console.error("Payment Intent Error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
