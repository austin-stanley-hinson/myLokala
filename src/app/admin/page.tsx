import Link from "next/link";

type AdminAction = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

type AdminSection = {
  title: string;
  description: string;
  actions: AdminAction[];
};

const sections: AdminSection[] = [
  {
    title: "Businesses",
    description: "Create and manage business records used across Lokala.",
    actions: [
      {
        title: "Add Business",
        description: "Create a new business profile and optional logo.",
        href: "/admin/restaurants/new",
        cta: "Open tool",
      },
      {
        title: "View Businesses",
        description: "Browse and edit existing business entries.",
        href: "/admin/restaurants",
        cta: "View list",
      },
    ],
  },
  {
    title: "Coupons",
    description: "Seed and manage local business offer data for the marketplace.",
    actions: [
      {
        title: "Add Coupon",
        description: "Create a coupon tied to any existing business.",
        href: "/admin/coupons/new",
        cta: "Open tool",
      },
      {
        title: "View Coupons",
        description: "Review or maintain coupon entries in one place.",
        href: "/admin/coupons",
        cta: "View list",
      },
    ],
  },
  {
    title: "Quick Links",
    description: "Jump to frequently used product pages while testing.",
    actions: [
      {
        title: "Homepage",
        description: "Go to the customer marketplace landing page.",
        href: "/",
        cta: "Go to homepage",
      },
      {
        title: "Business Dashboard",
        description: "Open the business owner dashboard experience.",
        href: "/restaurant/dashboard",
        cta: "Go to dashboard",
      },
    ],
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <div className="w-full space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark sm:text-4xl">
            Admin Dashboard
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Internal tools for managing businesses, coupons, and prototype data
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {section.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {section.description}
              </p>

              <div className="mt-5 space-y-3">
                {section.actions.map((action) => (
                  <div
                    key={action.href}
                    className="rounded-xl border border-border/70 bg-background/70 p-4"
                  >
                    <h3 className="text-sm font-semibold text-foreground">
                      {action.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {action.description}
                    </p>
                    <Link
                      href={action.href}
                      className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
                    >
                      {action.cta}
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
