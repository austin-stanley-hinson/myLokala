import type { Metadata } from "next";
import { Mail, MapPin } from "lucide-react";

import { buildPageMetadata } from "@/lib/seo";
import { COMPANY, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact | Lokala",
  description: "Get in touch with the Lokala team.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <section className="px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <p className="rise-in text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
          Contact
        </p>
        <h1 className="rise-in mt-3 text-5xl font-bold [--rise-delay:80ms] sm:text-6xl">
          Say hello.
        </h1>
        <p className="rise-in mt-5 max-w-xl text-lg text-lokala-muted [--rise-delay:140ms]">
          Questions about the app, a business that wants to join, or something
          we got wrong? Drop us a line. A real person reads every email.
        </p>

        <div className="rise-in mt-10 grid gap-4 [--rise-delay:220ms] sm:grid-cols-2">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="group rounded-lokala-lg border border-lokala-border bg-white p-6 shadow-lokala-card transition duration-300 hover:-translate-y-1 hover:shadow-lokala-lift"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark transition-transform duration-300 group-hover:-rotate-6">
              <Mail className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-sm font-bold uppercase tracking-wider text-lokala-muted">
              Email
            </p>
            <p className="mt-1 break-all text-lg font-semibold text-lokala-brown-dark">
              {CONTACT_EMAIL}
            </p>
          </a>
          <div className="rounded-lokala-lg border border-lokala-border bg-white p-6 shadow-lokala-card">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
              <MapPin className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-sm font-bold uppercase tracking-wider text-lokala-muted">
              Mail
            </p>
            <address className="mt-1 text-lg font-semibold not-italic text-lokala-brown-dark">
              {COMPANY.legalName}
              <br />
              {COMPANY.street} {COMPANY.locality}, {COMPANY.region}
            </address>
          </div>
        </div>
      </div>
    </section>
  );
}
