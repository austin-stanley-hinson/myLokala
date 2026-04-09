type CouponDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CouponDetailPage({
  params,
}: CouponDetailPageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm text-muted-foreground">Coupon</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{id}</h1>
      <p className="mt-4 text-muted-foreground">
        Detail view placeholder — wire to Supabase by <code className="rounded bg-muted px-1.5 py-0.5 text-sm">id</code>.
      </p>
    </div>
  );
}
