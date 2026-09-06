/**
 * Look up a Supabase user's email by id via the service-role admin API.
 * SERVER-ONLY -- requires a service-role client (auth.admin is not part of
 * the anon/authenticated surface).
 *
 * Shared by balance-purchase-webhook.ts (purchaser confirmation on gift
 * issuance) and gift-claim-confirmation.ts (purchaser confirmation on gift
 * claim) -- both need the same "resolve a user id to an email, or null"
 * lookup and neither should duplicate it.
 */

export type UserEmailLookupAdmin = {
  auth: {
    admin: {
      getUserById: (userId: string) => Promise<{
        data: { user: { email?: string | null } | null } | null;
        error: unknown;
      }>;
    };
  };
};

export async function getUserEmailById(
  admin: UserEmailLookupAdmin,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}
