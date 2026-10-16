import type { ReactNode } from "react";

import { Reveal } from "@/components/app/reveal";
import type { LegalBlock, LegalDoc } from "@/content/legal";
import { COMPANY, CONTACT_EMAIL } from "@/lib/site";

/** Turns any email address in the copy into a mailto link. */
function linkify(text: string): ReactNode {
  const parts = text.split(/([\w.+-]+@[\w-]+\.[\w.]+)/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={`mailto:${part}`}
        className="break-all font-semibold text-lokala-green-dark underline decoration-lokala-green/40 underline-offset-2 hover:decoration-lokala-green-dark"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "p" ? (
          <p key={i}>{linkify(block.text)}</p>
        ) : (
          <ul key={i} className="space-y-2.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-lokala-green"
                />
                <span>
                  {item.lead ? (
                    <strong className="font-semibold text-lokala-brown-dark">
                      {item.lead}:{" "}
                    </strong>
                  ) : null}
                  {linkify(item.text)}
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const contactNumber = doc.sections.length + 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
      <header className="rise-in max-w-3xl">
        <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{doc.title}</h1>
        {doc.meta.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {doc.meta.map((line) => (
              <span
                key={line}
                className="rounded-full border border-lokala-border bg-white/80 px-3 py-1 text-sm font-medium text-lokala-muted"
              >
                {line}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-14">
        <nav
          aria-label="On this page"
          className="rise-in h-fit rounded-lokala border border-lokala-border bg-white/70 p-5 [--rise-delay:120ms] lg:sticky lg:top-28"
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-lokala-green-dark">
            On this page
          </p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {doc.sections.map((section, i) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex gap-2 rounded-lg px-2 py-1 text-lokala-muted transition-colors hover:bg-lokala-green-light hover:text-lokala-green-dark"
                >
                  <span className="tabular-nums text-lokala-green-dark">{i + 1}.</span>
                  {section.title}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#contact-us"
                className="flex gap-2 rounded-lg px-2 py-1 text-lokala-muted transition-colors hover:bg-lokala-green-light hover:text-lokala-green-dark"
              >
                <span className="tabular-nums text-lokala-green-dark">{contactNumber}.</span>
                Contact Us
              </a>
            </li>
          </ol>
        </nav>

        <article className="rise-in min-w-0 rounded-lokala-lg border border-lokala-border bg-white/90 p-6 shadow-lokala-card [--rise-delay:200ms] sm:p-10">
          <div className="space-y-4 text-base leading-relaxed text-lokala-text/90">
            {doc.intro.length > 0 ? (
              <div className="space-y-4 border-b border-lokala-border pb-8">
                <Blocks blocks={doc.intro} />
              </div>
            ) : null}

            {doc.sections.map((section, i) => (
              <Reveal
                as="section"
                key={section.id}
                className="scroll-mt-28 space-y-4 border-b border-lokala-border py-8 first:pt-0 last:border-none"
              >
                <h2 id={section.id} className="scroll-mt-28 text-2xl font-semibold">
                  <span className="mr-2 text-lokala-green-dark">{i + 1}.</span>
                  {section.title}
                </h2>
                {section.blocks ? <Blocks blocks={section.blocks} /> : null}
                {section.subsections?.map((sub) => (
                  <div key={sub.title} className="space-y-3 pt-2">
                    <h3 className="font-sans text-lg font-bold text-lokala-brown-dark">
                      {sub.title}
                    </h3>
                    <Blocks blocks={sub.blocks} />
                  </div>
                ))}
              </Reveal>
            ))}

            <Reveal as="section" className="scroll-mt-28 pt-8">
              <h2 id="contact-us" className="scroll-mt-28 text-2xl font-semibold">
                <span className="mr-2 text-lokala-green-dark">{contactNumber}.</span>
                Contact Us
              </h2>
              <address className="mt-4 rounded-lokala border border-lokala-border bg-lokala-green-soft p-5 not-italic leading-relaxed">
                <strong className="block text-lokala-brown-dark">{COMPANY.legalName}</strong>
                {COMPANY.street} {COMPANY.locality}, {COMPANY.region}
                <br />
                {linkify(CONTACT_EMAIL)}
              </address>
            </Reveal>
          </div>
        </article>
      </div>
    </div>
  );
}
