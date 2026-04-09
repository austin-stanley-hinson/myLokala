export type CouponStatus = "draft" | "active" | "expired" | "redeemed";

export type Coupon = {
  id: string;
  merchantId: string;
  title: string;
  description: string | null;
  discountLabel: string;
  status: CouponStatus;
  expiresAt: string | null;
  createdAt: string;
};
