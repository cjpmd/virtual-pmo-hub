// The public legal pages (/terms, /privacy, /dpa): the site hero, a "last updated" line, a
// numbered contents list and numbered sections, on the --site-* tokens. [[solicitor to confirm …]]
// markers in the text are hidden (they are listed in docs/legal-drafts/solicitor-checklist.md);
// any other [[placeholder]] is highlighted so it can't be missed. With `printable`, a
// "Print or save as PDF" button prints the document alone on A4 portrait (styles.css,
// .legal-doc).
import { Printer } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { SiteFooter, SitePage } from "@/components/marketing/site-chrome";
import { SiteHero } from "@/components/marketing/site-page-parts";
import { SupportLink } from "@/components/support-link";
import { subprocessors } from "@/data/subprocessors";
import { LEGAL_LAST_UPDATED, withoutSolicitorMarkers } from "@/lib/legal";

/** A paragraph (string), a bulleted list (string[]), or anything else to render as it is. */
export type LegalBlock = string | string[] | ReactNode;

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

/** Text with each [[placeholder]] highlighted and [[solicitor to confirm …]] markers removed. */
export function LegalText({ text }: { text: string }) {
  return (
    <>
      {withoutSolicitorMarkers(text)
        .split(/(\[\[[^\]]+\]\])/)
        .map((part, index) =>
          part.startsWith("[[") && part.endsWith("]]") ? (
            <mark key={index} className="rounded bg-amber-100 px-1 text-amber-900">
              {part}
            </mark>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string")
    return (
      <p className="m-0 text-[15px] leading-[1.7] text-site-text-muted">
        <LegalText text={block} />
      </p>
    );
  if (Array.isArray(block) && block.every((item) => typeof item === "string"))
    return (
      <ul className="m-0 flex list-disc flex-col gap-1.5 pl-6 text-[15px] leading-[1.65] text-site-text-muted">
        {(block as string[]).map((item) => (
          <li key={item}>
            <LegalText text={item} />
          </li>
        ))}
      </ul>
    );
  return <>{block}</>;
}

/** The subprocessor table shared by /security, /privacy and /dpa. */
export function SubprocessorTable({ id }: { id?: string }) {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-site-line bg-site-surface">
      <table className="w-full min-w-[640px] border-collapse text-left text-[0.9rem]">
        <caption id={id} className="sr-only">
          Subprocessors
        </caption>
        <thead className="bg-site-tint-blue text-site-text-soft">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Subprocessor
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Purpose
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Location
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Transfer safeguard
            </th>
          </tr>
        </thead>
        <tbody>
          {subprocessors.map((row) => (
            <tr key={row.name} className="border-t border-site-line align-top">
              <th scope="row" className="px-4 py-3 font-medium">
                {row.name}
              </th>
              <td className="px-4 py-3 text-site-text-muted">{row.purpose}</td>
              <td className="px-4 py-3 text-site-text-muted">
                <LegalText text={row.region} />
              </td>
              <td className="px-4 py-3 text-site-text-muted">
                <LegalText text={row.transfers} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage({
  title,
  intro,
  sections,
  printable = false,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  printable?: boolean;
}) {
  return (
    <SitePage>
      <div className="print:hidden">
        <SiteHero eyebrow="Legal" title={title}>
          {intro}
        </SiteHero>
      </div>

      <main className="legal-doc mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-4 py-14 sm:px-8 sm:py-16">
        <h1 className="m-0 hidden text-[24px] font-bold print:block">ORMO PMO — {title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-[14px] font-semibold text-site-text-soft">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          {printable && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-site-line bg-site-surface px-4 text-[14px] font-semibold text-site-accent-strong hover:border-site-accent-strong print:hidden"
            >
              <Printer aria-hidden="true" className="size-4" />
              Print or save as PDF
            </button>
          )}
        </div>

        <nav
          aria-label="Contents"
          className="max-w-[44rem] rounded-[18px] border border-site-line bg-site-surface p-6 print:hidden"
        >
          <h2 className="m-0 mb-3 text-[12px] font-bold tracking-[0.16em] text-site-text-faint uppercase">
            Contents
          </h2>
          <ol className="m-0 grid list-decimal gap-1 pl-6 text-[15px] sm:grid-cols-2 sm:gap-x-8">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-site-accent-strong hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex max-w-[52rem] flex-col gap-10">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="flex scroll-mt-6 flex-col gap-3"
            >
              <h2
                id={`${section.id}-title`}
                className="m-0 text-[22px] font-bold tracking-[-0.01em] text-site-text"
              >
                {index + 1}. {section.title}
              </h2>
              {section.blocks.map((block, blockIndex) => (
                <Block key={blockIndex} block={block} />
              ))}
            </section>
          ))}
        </div>

        <p className="m-0 max-w-[44rem] leading-[1.65] text-site-text-muted print:hidden">
          Questions about this page? <SupportLink className="text-site-accent-strong" />
        </p>
      </main>

      <div className="print:hidden">
        <SiteFooter />
      </div>
    </SitePage>
  );
}
