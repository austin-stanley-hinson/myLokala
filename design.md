# Lokala Design Guide — UI/UX Refresh

This `design.md` is for Claude to follow when refreshing the Lokala webapp UI. Ignore backend/payment/account functionality for now. The goal is visual direction, layout, color, spacing, and interaction design.

## 0. Main Goal

Redo the look of the Lokala webapp so it feels brighter, warmer, more local, and more community-centered.

The current app feels too dark/heavy. The new direction should feel closer to a polished local community site mixed with a modern gift-card/deals marketplace.

The design should say:

> Lokala helps people support nearby businesses, discover local deals, and keep money in the community.

Do not make it feel like a cold SaaS dashboard. Do not make it feel like a generic coupon app. It should feel like Waterville, Maine + small businesses + neighborhood trust + modern checkout polish.

---

## 1. References to Build From

Use these as visual/community references:

```txt
https://www.augustamaine.gov/
https://giverrang.com/
https://www.waterville-me.gov/
```

### What to borrow from the references

Borrow the **community energy**, not the exact styling.

Use ideas like:

- Civic/local pride
- Clear top navigation
- Big readable category labels
- Community action cards
- Local imagery
- News/event-like sections
- Bright, approachable surfaces
- Simple paths for residents/shoppers
- Gift-card marketplace polish

### What not to borrow

Do not copy old government-site stiffness. Lokala should be more modern, rounded, friendly, and mobile-first.

---

## 2. Logo-Based Brand Direction

The new Lokala logo has:

- Light/medium green tree canopy
- Warm brown community/tree figure
- White rounded-square app icon
- Organic, people-centered shape language

The website should visually match that logo.

### Brand meaning

| Logo Element | UI Meaning |
| --- | --- |
| Green tree canopy | Local growth, small businesses, trust, fresh discovery |
| Brown people/tree shape | Community, warmth, human connection |
| White rounded square | Clean app polish, softness, modern mobile UI |
| Organic curves | Friendly, approachable, not corporate |

---

## 3. Updated Color System

The UI needs to be brighter than before. Use a light, cheerful palette based on the new logo.

The logo’s green and brown can be used, but for the website we should use slightly lighter versions so the UI pops more.

### Primary Palette

```css
:root {
  /* Main brand colors */
  --lokala-green: #79B85A;
  --lokala-green-dark: #4F8F3A;
  --lokala-green-light: #EAF7DF;
  --lokala-green-soft: #F4FAEF;

  --lokala-brown: #7A3E22;
  --lokala-brown-dark: #4B2112;
  --lokala-brown-light: #B87955;
  --lokala-brown-soft: #F7EDE7;

  /* Warm bright surfaces */
  --lokala-cream: #FFF9EC;
  --lokala-cream-light: #FFFDF7;
  --lokala-surface: #FFFFFF;
  --lokala-surface-warm: #FFFCF4;

  /* Community accent colors */
  --lokala-sky: #EAF6FF;
  --lokala-sky-dark: #2F6F8F;
  --lokala-sun: #F7C85F;
  --lokala-sun-soft: #FFF4CE;

  /* Text and borders */
  --lokala-text: #241A14;
  --lokala-muted: #756B63;
  --lokala-border: #EADFCC;

  /* Status colors */
  --lokala-success: #4F8F3A;
  --lokala-warning: #D99A2B;
  --lokala-danger: #C64632;
}
```

### Tailwind Theme Extension

Add or update this in `tailwind.config.ts`.

```ts
theme: {
  extend: {
    colors: {
      lokala: {
        green: "#79B85A",
        "green-dark": "#4F8F3A",
        "green-light": "#EAF7DF",
        "green-soft": "#F4FAEF",

        brown: "#7A3E22",
        "brown-dark": "#4B2112",
        "brown-light": "#B87955",
        "brown-soft": "#F7EDE7",

        cream: "#FFF9EC",
        "cream-light": "#FFFDF7",
        surface: "#FFFFFF",
        "surface-warm": "#FFFCF4",

        sky: "#EAF6FF",
        "sky-dark": "#2F6F8F",
        sun: "#F7C85F",
        "sun-soft": "#FFF4CE",

        text: "#241A14",
        muted: "#756B63",
        border: "#EADFCC",

        success: "#4F8F3A",
        warning: "#D99A2B",
        danger: "#C64632",
      },
    },
    borderRadius: {
      lokala: "1.5rem",
      "lokala-lg": "2rem",
      "lokala-xl": "2.5rem",
    },
    boxShadow: {
      "lokala-card": "0 14px 35px rgba(75, 33, 18, 0.08)",
      "lokala-soft": "0 10px 25px rgba(79, 143, 58, 0.14)",
      "lokala-lift": "0 18px 45px rgba(75, 33, 18, 0.12)",
    },
  },
}
```

---

## 4. Color Usage Rules

### Use green for

- Primary buttons
- Active nav states
- “Support local” accents
- Deal claim actions
- Positive status badges
- Section highlights
- Small icons related to local discovery

### Use brown for

- Headings
- Brand warmth
- Important labels
- Navbar wordmark
- Community-focused emphasis

### Use cream for

- Page backgrounds
- Large section backgrounds
- Soft hero areas
- Warm empty states

### Use white for

- Cards
- Forms
- Deal tiles
- Checkout panels
- Merchant sections

### Use sun/yellow sparingly for

- Featured deal
- Gift certificate accent
- Expiring soon
- Small alert highlights

### Avoid

- Dark full-page backgrounds
- Black-heavy dashboards
- Neon green
- The orange wallpaper from the logo screenshot
- Gray-on-gray SaaS styling

---

## 5. Overall Visual Style

Lokala should be:

```txt
Bright
Local
Friendly
Community-centered
Rounded
Readable
Trustworthy
Modern
```

Lokala should not be:

```txt
Dark
Corporate
Dense
Generic
Overly gray
Overly orange
Crypto-looking
Banking-dashboard-looking
```

### Shape language

Because the logo uses a rounded-square app icon and organic tree curves, the UI should use:

- Rounded cards
- Pill buttons
- Soft image corners
- Large comfortable spacing
- Smooth hover states
- Light borders
- Gentle shadows

Recommended radius:

```txt
Buttons: rounded-full
Inputs: rounded-2xl
Cards: rounded-3xl
Hero image containers: rounded-[2rem] or rounded-[2.5rem]
Modals/panels: rounded-[2rem]
```

---

## 6. Page Background

Use a bright warm background by default.

```tsx
<main className="min-h-screen bg-lokala-cream-light text-lokala-text">
  ...
</main>
```

For homepage sections, use subtle community gradients:

```tsx
<section className="bg-gradient-to-b from-lokala-green-soft via-lokala-cream to-white">
  ...
</section>
```

Avoid dark brown or dark green backgrounds as the main page background.

Dark colors can be used only for small contrast sections or footer areas.

---

## 7. Homepage Hero Direction

The homepage should feel like a local community landing page, not a full-screen stock photo.

### Important Colin note

Replace the current background image.

Use imagery related to:

- Waterville
- Maine small-town feel
- Pine trees
- Local streets
- Downtown/community businesses
- Warm outdoor scenes

The image should **not fill the whole website page**. It should behave like the reference sites: a contained feature image or hero panel, not an overpowering full-page wallpaper.

### Recommended hero layout

Use a split hero:

- Left side: copy, CTA, trust badges
- Right side: contained image card of Waterville/pine trees/local community

```tsx
<section className="bg-gradient-to-b from-lokala-green-soft via-lokala-cream to-white px-6 py-16 md:py-24">
  <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[1.05fr_0.95fr]">
    <div>
      <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-lokala-green-dark shadow-lokala-soft">
        <span className="h-2 w-2 rounded-full bg-lokala-green" />
        Support local. Save nearby.
      </div>

      <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-lokala-brown-dark md:text-6xl">
        Local deals, rooted in your community.
      </h1>

      <p className="mt-5 max-w-2xl text-lg leading-8 text-lokala-muted">
        Discover offers, gift certificates, and local favorites from businesses around Waterville.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a className="rounded-full bg-lokala-green px-7 py-4 text-center font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark">
          Browse Local Deals
        </a>

        <a className="rounded-full border border-lokala-border bg-white px-7 py-4 text-center font-bold text-lokala-brown transition hover:-translate-y-0.5 hover:bg-lokala-brown-soft">
          Buy a Gift Certificate
        </a>
      </div>
    </div>

    <div className="relative">
      <div className="absolute -left-5 -top-5 h-28 w-28 rounded-full bg-lokala-sun-soft blur-2xl" />
      <div className="overflow-hidden rounded-[2.5rem] border border-white bg-white p-3 shadow-lokala-card">
        <img
          src="/waterville-hero.jpg"
          alt="Waterville local community"
          className="h-[420px] w-full rounded-[2rem] object-cover"
        />
      </div>
    </div>
  </div>
</section>
```

### Hero image rules

Good:

```txt
Contained image card
Rounded image corners
Partial-height hero image
Warm natural lighting
Local Maine / pine tree / downtown feel
```

Bad:

```txt
Full-screen background image
Dark overlay covering everything
Stock photo that looks unrelated to Maine/local community
Image stretching behind the entire app
```

---

## 8. Header / Navbar

The top header needs bigger text for categories.

The nav should be bright, clean, and easy to scan.

### Desktop navbar

```tsx
<header className="sticky top-0 z-50 border-b border-lokala-border bg-lokala-cream-light/90 backdrop-blur-xl">
  <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
    <a className="flex items-center gap-3">
      <img src="/lokala-logo.png" alt="Lokala logo" className="h-11 w-11 rounded-2xl" />
      <span className="text-2xl font-extrabold tracking-tight text-lokala-brown-dark">
        Lokala
      </span>
    </a>

    <div className="hidden items-center gap-2 md:flex">
      <a className="rounded-full px-4 py-2 text-base font-bold text-lokala-brown hover:bg-white hover:text-lokala-green-dark">
        Deals
      </a>
      <a className="rounded-full px-4 py-2 text-base font-bold text-lokala-brown hover:bg-white hover:text-lokala-green-dark">
        Gift Certificates
      </a>
      <a className="rounded-full px-4 py-2 text-base font-bold text-lokala-brown hover:bg-white hover:text-lokala-green-dark">
        Businesses
      </a>
      <a className="rounded-full px-4 py-2 text-base font-bold text-lokala-brown hover:bg-white hover:text-lokala-green-dark">
        Community
      </a>
    </div>

    <a className="rounded-full bg-lokala-green px-5 py-3 text-sm font-bold text-white shadow-lokala-soft hover:bg-lokala-green-dark">
      Sign In
    </a>
  </nav>
</header>
```

### Header rules

- Category text should be `text-base` minimum on desktop.
- Use `font-bold` or `font-semibold`.
- Increase hit area with `px-4 py-2`.
- Keep the navbar background light.
- Logo should be large enough to visually anchor the header.
- Include a visible “Gift Certificates” nav item.

---

## 9. Alert Banner

Colin said the alert looks weird. Redesign it to be slim, friendly, and civic-style.

The alert should not look like an error box unless something is actually broken.

### Good alert style

```tsx
<div className="border-b border-lokala-border bg-lokala-sun-soft">
  <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
    <p className="text-sm font-semibold text-lokala-brown-dark">
      New local gift certificates are now available for participating Waterville businesses.
    </p>
    <a className="text-sm font-bold text-lokala-green-dark underline-offset-4 hover:underline">
      Learn more
    </a>
  </div>
</div>
```

### Alert rules

Do:

- Use a thin full-width banner
- Use light yellow/cream/green
- Keep text short
- Put it above or directly under the navbar
- Make it feel like a city/community notice

Do not:

- Use harsh red unless urgent
- Make it huge
- Use dark backgrounds
- Use oversized icons
- Let it visually compete with the hero

---

## 10. Community Action Cards

The reference sites feel community-centered because they give users clear action paths.

Add a “What do you want to do today?” section.

### Section example

```tsx
<section className="bg-white px-6 py-14">
  <div className="mx-auto max-w-7xl">
    <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Start here
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-lokala-brown-dark">
          What would you like to do today?
        </h2>
      </div>
      <p className="max-w-xl text-lokala-muted">
        Shop local, discover nearby deals, or send someone a community gift.
      </p>
    </div>

    <div className="grid gap-5 md:grid-cols-3">
      <div className="rounded-3xl border border-lokala-border bg-lokala-green-soft p-6 shadow-lokala-card">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lokala-green-dark">
          %
        </div>
        <h3 className="text-xl font-extrabold text-lokala-brown-dark">Find Deals</h3>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Browse offers from nearby cafés, restaurants, and local shops.
        </p>
      </div>

      <div className="rounded-3xl border border-lokala-border bg-lokala-sun-soft p-6 shadow-lokala-card">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lokala-brown">
          🎁
        </div>
        <h3 className="text-xl font-extrabold text-lokala-brown-dark">Buy a Gift Certificate</h3>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Send local spending power to a friend, student, or family member.
        </p>
      </div>

      <div className="rounded-3xl border border-lokala-border bg-lokala-sky p-6 shadow-lokala-card">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lokala-sky-dark">
          🏪
        </div>
        <h3 className="text-xl font-extrabold text-lokala-brown-dark">Explore Businesses</h3>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Meet the local businesses that make the community feel alive.
        </p>
      </div>
    </div>
  </div>
</section>
```

---

## 11. Deal Cards

Deal cards should be brighter and more friendly.

### Deal card style

```tsx
<article className="group rounded-[2rem] border border-lokala-border bg-white p-5 shadow-lokala-card transition duration-200 hover:-translate-y-1 hover:shadow-lokala-lift">
  <div className="mb-4 overflow-hidden rounded-[1.5rem] bg-lokala-green-soft">
    <img
      src="/business-image.jpg"
      alt="Local business"
      className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
    />
  </div>

  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-bold text-lokala-green-dark">Local deal</p>
      <h3 className="mt-1 text-xl font-extrabold text-lokala-brown-dark">
        20% off any latte
      </h3>
      <p className="mt-1 text-sm text-lokala-muted">Mbingo Coffee · 0.4 miles away</p>
    </div>

    <span className="rounded-full bg-lokala-green-light px-3 py-1 text-xs font-bold text-lokala-green-dark">
      Active
    </span>
  </div>

  <button className="mt-5 w-full rounded-full bg-lokala-green px-5 py-3 font-bold text-white shadow-lokala-soft hover:bg-lokala-green-dark">
    Claim Deal
  </button>
</article>
```

### Card rules

- Always use bright white cards.
- Use soft shadows.
- Use rounded image areas.
- Use green badges.
- Make merchant names and deal titles readable.
- Keep the call-to-action clear and high contrast.
- Avoid dark cards.

---

## 12. Gift Certificate UI Direction

Ignore payment functionality for now. This section is about how the gift certificate flow should look.

There should be a clear top header/nav item called:

```txt
Gift Certificates
```

The gift certificate flow should look like a branded, friendly payment interface using Lokala colors.

### Gift certificate page visual structure

Use a clean two-step visual flow:

1. Gift details panel
2. Payment/summary split panel

### Gift details screen

Visual fields:

- Amount
- Recipient name
- Recipient email
- Optional note
- Purchase button

Style it like a warm card, not a plain form.

```tsx
<section className="bg-gradient-to-b from-lokala-sun-soft via-lokala-cream to-white px-6 py-16">
  <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.9fr_1.1fr]">
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
        Gift Certificates
      </p>
      <h1 className="mt-3 text-5xl font-extrabold tracking-tight text-lokala-brown-dark">
        Send someone a little local love.
      </h1>
      <p className="mt-5 text-lg leading-8 text-lokala-muted">
        Choose an amount and send a gift certificate they can use with participating local businesses.
      </p>
    </div>

    <div className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card">
      <label className="text-sm font-bold text-lokala-brown-dark">Gift amount</label>
      <div className="mt-2 rounded-2xl border border-lokala-border bg-lokala-cream-light px-4 py-4 text-3xl font-extrabold text-lokala-brown-dark">
        $100
      </div>

      <div className="mt-5 grid gap-4">
        <input className="rounded-2xl border border-lokala-border px-4 py-3" placeholder="Recipient name" />
        <input className="rounded-2xl border border-lokala-border px-4 py-3" placeholder="Recipient email" />
      </div>

      <button className="mt-6 w-full rounded-full bg-lokala-green px-6 py-4 font-extrabold text-white shadow-lokala-soft">
        Continue to Purchase
      </button>
    </div>
  </div>
</section>
```

### Payment/summary split screen

Once the user continues, visually use a split layout.

Left half:

- Payment method choices
- Card / PayPal / Venmo-style cards
- Lokala-styled selection states

Right half:

- Gift amount
- Lokala fee
- Stripe/payment fee
- Total
- Purchase button

Example visual math:

```txt
Gift certificate: $100.00
Lokala fee: $2.00
Stripe/payment fee: $0.80
Total: $102.80
```

### Split screen style

```tsx
<div className="grid min-h-[620px] gap-6 bg-lokala-cream-light px-6 py-10 md:grid-cols-2">
  <section className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card">
    <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
      Choose payment method
    </h2>

    <div className="mt-6 grid gap-4">
      <button className="rounded-3xl border-2 border-lokala-green bg-lokala-green-soft p-5 text-left shadow-lokala-soft">
        <p className="font-extrabold text-lokala-brown-dark">Credit or Debit Card</p>
        <p className="mt-1 text-sm text-lokala-muted">Pay securely with card.</p>
      </button>

      <button className="rounded-3xl border border-lokala-border bg-white p-5 text-left hover:bg-lokala-sky">
        <p className="font-extrabold text-lokala-brown-dark">PayPal</p>
        <p className="mt-1 text-sm text-lokala-muted">Use a PayPal-style payment flow.</p>
      </button>

      <button className="rounded-3xl border border-lokala-border bg-white p-5 text-left hover:bg-lokala-sky">
        <p className="font-extrabold text-lokala-brown-dark">Venmo</p>
        <p className="mt-1 text-sm text-lokala-muted">Use a Venmo-style payment flow.</p>
      </button>
    </div>
  </section>

  <aside className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card">
    <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
      Purchase summary
    </h2>

    <div className="mt-6 space-y-4 text-lokala-text">
      <div className="flex justify-between">
        <span>Gift certificate</span>
        <span className="font-bold">$100.00</span>
      </div>

      <div className="flex justify-between text-lokala-muted">
        <span>Lokala fee</span>
        <span>$2.00</span>
      </div>

      <div className="flex justify-between text-lokala-muted">
        <span>Payment fee</span>
        <span>$0.80</span>
      </div>

      <div className="border-t border-lokala-border pt-4">
        <div className="flex items-end justify-between">
          <span className="text-lg font-extrabold text-lokala-brown-dark">Total</span>
          <span className="text-4xl font-extrabold text-lokala-green-dark">$102.80</span>
        </div>
      </div>
    </div>

    <button className="mt-8 w-full rounded-full bg-lokala-green px-6 py-4 font-extrabold text-white shadow-lokala-soft hover:bg-lokala-green-dark">
      Purchase Gift Certificate
    </button>
  </aside>
</div>
```

---

## 13. Local Business / Community Sections

Add sections that scream community.

Suggested homepage sections:

```txt
Hero
What would you like to do today?
Featured local deals
Gift certificates
Meet local businesses
Community impact
Footer
```

### Community impact section

Use warm stats similar to civic “by the numbers” sections.

```tsx
<section className="bg-lokala-green-soft px-6 py-16">
  <div className="mx-auto max-w-7xl">
    <div className="rounded-[2.5rem] bg-white p-8 shadow-lokala-card md:p-10">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
        Community impact
      </p>
      <h2 className="mt-3 text-4xl font-extrabold text-lokala-brown-dark">
        Every purchase helps local businesses grow.
      </h2>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <div className="rounded-3xl bg-lokala-cream p-6">
          <p className="text-4xl font-extrabold text-lokala-green-dark">10+</p>
          <p className="mt-2 font-bold text-lokala-brown-dark">Local businesses</p>
        </div>
        <div className="rounded-3xl bg-lokala-cream p-6">
          <p className="text-4xl font-extrabold text-lokala-green-dark">200+</p>
          <p className="mt-2 font-bold text-lokala-brown-dark">Community users</p>
        </div>
        <div className="rounded-3xl bg-lokala-cream p-6">
          <p className="text-4xl font-extrabold text-lokala-green-dark">Waterville</p>
          <p className="mt-2 font-bold text-lokala-brown-dark">Built for local discovery</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## 14. Typography

Use bigger, clearer text throughout the app.

Recommended fonts:

```txt
Primary: Inter, Geist Sans, or Manrope
Best fit: Manrope for friendly bold headings + Inter/Geist for UI
```

### Type scale

```txt
Hero headline: text-5xl to text-6xl on desktop
Page title: text-3xl to text-5xl
Section title: text-3xl to text-4xl
Card title: text-xl to text-2xl
Navbar categories: text-base minimum, font-bold
Body: text-base to text-lg
Small helper text: text-sm
```

### Typography rules

- Headings should use brown/dark brown.
- Body text should be readable, not too gray.
- Avoid tiny nav/category labels.
- Avoid thin fonts.
- Use bold section labels and strong hierarchy.

---

## 15. Forms and Inputs

Inputs should match the bright rounded design.

```tsx
<input className="rounded-2xl border border-lokala-border bg-white px-4 py-3 text-base text-lokala-text placeholder:text-lokala-muted focus:border-lokala-green focus:outline-none focus:ring-4 focus:ring-lokala-green-light" />
```

Labels:

```tsx
<label className="text-sm font-bold text-lokala-brown-dark">
  Recipient email
</label>
```

Form panels:

```tsx
<div className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card">
  ...
</div>
```

---

## 16. Buttons

### Primary button

```tsx
<button className="rounded-full bg-lokala-green px-6 py-3 font-extrabold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark">
  Claim Deal
</button>
```

### Secondary button

```tsx
<button className="rounded-full border border-lokala-border bg-white px-6 py-3 font-extrabold text-lokala-brown transition hover:-translate-y-0.5 hover:bg-lokala-brown-soft">
  Learn More
</button>
```

### Gift certificate button

```tsx
<button className="rounded-full bg-lokala-sun px-6 py-3 font-extrabold text-lokala-brown-dark shadow-lokala-card transition hover:-translate-y-0.5">
  Buy Gift Certificate
</button>
```

Button rules:

- Bigger padding
- Rounded-full
- Bold text
- Clear hover state
- No tiny ghost buttons for important actions

---

## 17. Badges

Use rounded pill badges.

```tsx
<span className="rounded-full bg-lokala-green-light px-3 py-1 text-xs font-extrabold text-lokala-green-dark">
  Active
</span>
```

```tsx
<span className="rounded-full bg-lokala-sun-soft px-3 py-1 text-xs font-extrabold text-lokala-brown-dark">
  Featured
</span>
```

```tsx
<span className="rounded-full bg-lokala-brown-soft px-3 py-1 text-xs font-extrabold text-lokala-brown">
  Redeemed
</span>
```

---

## 18. Merchant Dashboard UI

Even the dashboard should not feel dark.

Use:

- Bright cream page background
- White cards
- Green active states
- Brown headings
- Rounded metric cards
- Friendly empty states

Avoid:

- Cold gray admin panels
- Dark dashboard theme
- Sharp tables
- Tiny text

Dashboard shell:

```tsx
<main className="min-h-screen bg-lokala-cream-light px-6 py-8 text-lokala-text">
  <div className="mx-auto max-w-7xl">
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Business tools
        </p>
        <h1 className="mt-2 text-4xl font-extrabold text-lokala-brown-dark">
          Merchant Dashboard
        </h1>
      </div>

      <button className="rounded-full bg-lokala-green px-6 py-3 font-extrabold text-white shadow-lokala-soft">
        Create Deal
      </button>
    </div>
  </div>
</main>
```

Metric cards:

```tsx
<div className="rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card">
  <p className="text-sm font-bold text-lokala-muted">Total Redemptions</p>
  <p className="mt-2 text-4xl font-extrabold text-lokala-brown-dark">128</p>
</div>
```

---

## 19. Footer

Footer should feel civic/community inspired.

Use warm off-white or brown.

### Light footer option

```tsx
<footer className="border-t border-lokala-border bg-lokala-cream px-6 py-12">
  <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-4">
    ...
  </div>
</footer>
```

### Warm brown footer option

```tsx
<footer className="bg-lokala-brown-dark px-6 py-12 text-lokala-cream-light">
  <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-4">
    ...
  </div>
</footer>
```

Footer columns:

```txt
Lokala
For Shoppers
For Businesses
Community
```

---

## 20. Image Style

Use local imagery to create the community feeling.

### Image direction

Prioritize:

- Waterville downtown
- Local storefronts
- Cafés/restaurants
- Pine trees
- Maine outdoor scenes
- Community gatherings
- Bright daylight photos

### Image display rules

```tsx
className="rounded-[2rem] object-cover shadow-lokala-card"
```

Do not let one image fill the whole website.

Use images as:

- Contained hero card
- Section banner
- Deal card thumbnail
- Community block photo
- Background accent only when subtle

---

## 21. Motion

Keep motion subtle and polished.

```tsx
className="transition duration-200 ease-out hover:-translate-y-0.5"
```

Framer Motion:

```tsx
initial={{ opacity: 0, y: 12 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.35, ease: "easeOut" }}
```

Avoid:

- Bouncy cartoon movement
- Heavy spinning
- Long animations
- Flashy effects

---

## 22. Accessibility

Required:

- Strong contrast between text and background
- Big nav text
- Large click/tap areas
- Visible focus states
- Semantic buttons and links
- Alt text for images
- Keyboard-accessible deal cards

Focus ring:

```tsx
className="focus:outline-none focus:ring-4 focus:ring-lokala-green-light"
```

---

## 23. Mobile Design

Mobile should feel like a polished local app.

Mobile priorities:

- Header logo remains visible
- Nav collapses cleanly
- Gift Certificates remains easy to access
- Hero stacks with image below text
- Cards become one column
- Buttons are full-width when needed
- Checkout split screen becomes stacked

Mobile card width:

```tsx
className="w-full rounded-3xl"
```

Mobile button:

```tsx
className="w-full rounded-full py-4 text-base font-extrabold"
```

---

## 24. Do / Do Not Summary

### Do

- Make the app brighter.
- Use light green from the logo.
- Use warm brown from the logo, slightly lightened.
- Use cream and white as primary surfaces.
- Use local Waterville/pine-tree imagery.
- Keep hero images contained, not full-page.
- Make navbar categories bigger.
- Redesign the alert as a slim civic notice.
- Add community action cards.
- Make Gift Certificates visually prominent.
- Use rounded cards and soft shadows.
- Make the app feel like community commerce.

### Do Not

- Do not use the orange wallpaper as brand color.
- Do not use dark full-page backgrounds.
- Do not use tiny nav text.
- Do not make the alert look like an error.
- Do not let the background image fill the entire website.
- Do not make the app look like generic Stripe/SaaS.
- Do not make the merchant dashboard cold and gray.
- Do not copy the reference websites exactly.

---

## 25. Claude Implementation Priority

When updating the app, apply this order:

1. Update Tailwind color tokens to the brighter Lokala palette.
2. Replace dark backgrounds with cream/white/green-soft surfaces.
3. Update navbar with bigger category text.
4. Add/clean up the Gift Certificates nav item.
5. Replace the hero background image with a contained Waterville/pine/community image card.
6. Redesign the alert banner as a slim civic-style notice.
7. Redesign homepage hero using warm copy, CTA buttons, and the contained local image.
8. Add a “What would you like to do today?” community action card section.
9. Redesign deal cards with bright white cards and green CTAs.
10. Redesign gift certificate screens visually using Lokala colors.
11. Update merchant dashboard cards to match the bright rounded style.
12. Clean up footer with community/civic structure.
13. Check mobile layouts.
14. Check contrast and accessibility.

---

## 26. Design North Star

Lokala should feel like a bright, modern community marketplace for Waterville: warm cream backgrounds, light green local-growth accents, friendly brown headings, contained local imagery, big readable navigation, rounded cards, and a gift-certificate flow that feels trustworthy and easy.
