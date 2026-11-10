import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LegalPage,
  LegalText,
  SubprocessorTable,
  type LegalSection,
} from "@/components/marketing/legal-page";
import { siteHead } from "@/components/marketing/site-head";
import { TERMS_VERSION } from "@/lib/legal";

// Draft for legal review (GL-7): not to be merged to main until the owner says so.
// The UK GDPR Article 28 agreement, incorporated by reference in /terms. Printable to PDF
// (LegalPage `printable`, print CSS in styles.css under .legal-doc).
export const Route = createFileRoute("/dpa")({
  head: () =>
    siteHead(
      "Data Processing Agreement — ORMO PMO",
      "The ORMO PMO Data Processing Agreement under UK GDPR Article 28, with our subprocessors and security measures.",
    ),
  component: DpaPage,
});

const linkClass = "text-site-accent-strong hover:underline";
const textClass = "m-0 text-[15px] leading-[1.7] text-site-text-muted";

const processingDetails: [string, string][] = [
  ["Subject matter", "Providing the ORMO PMO service to the Customer under the Terms."],
  [
    "Duration",
    "The term of the Terms, and afterwards until the Customer Personal Data is deleted.",
  ],
  [
    "Nature and purpose",
    "Hosting, storing, organising, displaying, exporting and emailing Customer Personal Data so that the Customer can manage its portfolios, programmes and projects; drafting text with AI when a user asks for it; support.",
  ],
  [
    "Types of personal data",
    "Names, work email addresses, job titles and roles; people named in projects, risks, issues, decisions, actions, meetings and reports; resource and capacity information; comments and other content users enter; audit-log entries.",
  ],
  [
    "Special category data",
    "None is required. The Customer must not enter special category or criminal offence data unless it has a lawful basis and has told us. [[solicitor to confirm]]",
  ],
  [
    "Data subjects",
    "The Customer’s users, employees, contractors, suppliers and stakeholders, and other people named in Customer content.",
  ],
];

const sections: LegalSection[] = [
  {
    id: "parties",
    title: "Parties and scope",
    blocks: [
      "This Data Processing Agreement (“DPA”) is between OriginOverthrow, a sole trader business based in Scotland trading as ORMO PMO (contact: support@ormo-pmo.originoverthrow.com) (the “Processor”, “we”), and the organisation that has accepted the ORMO PMO Terms of service (the “Customer”).",
      <p key="terms" className={textClass}>
        It forms part of the{" "}
        <Link to="/terms" className={linkClass}>
          Terms of service
        </Link>{" "}
        (version {TERMS_VERSION}) and applies to personal data that we process on the Customer’s
        behalf in providing ORMO PMO (“Customer Personal Data”). It is accepted with the Terms; no
        separate signature is needed. If the Customer would like a signed copy, contact{" "}
        support@ormo-pmo.originoverthrow.com.
      </p>,
      "Terms such as “controller”, “processor”, “personal data”, “processing” and “personal data breach” have the meanings given in the UK GDPR. “Data Protection Law” means the UK GDPR, the Data Protection Act 2018, and other UK law on the processing of personal data that applies.",
    ],
  },
  {
    id: "roles",
    title: "Roles",
    blocks: [
      "The Customer is the controller of Customer Personal Data and we are its processor. The Customer is responsible for having a lawful basis for the processing, for the instructions it gives, and for the accuracy of Customer Personal Data.",
    ],
  },
  {
    id: "details",
    title: "Details of the processing",
    blocks: [
      <dl
        key="details"
        className="m-0 grid gap-x-6 gap-y-3 rounded-[18px] border border-site-line bg-site-surface p-6 text-[15px] sm:grid-cols-[12rem_1fr]"
      >
        {processingDetails.map(([term, detail]) => (
          <div key={term} className="contents">
            <dt className="font-semibold text-site-text">{term}</dt>
            <dd className="m-0 leading-[1.65] text-site-text-muted">
              <LegalText text={detail} />
            </dd>
          </div>
        ))}
      </dl>,
    ],
  },
  {
    id: "obligations",
    title: "Our obligations",
    blocks: [
      "We will:",
      [
        "process Customer Personal Data only on the Customer’s documented instructions, which are the Terms, this DPA and the Customer’s use of the Service, unless the law requires otherwise (in which case we will tell the Customer first, unless the law forbids it);",
        "tell the Customer if we think an instruction breaks Data Protection Law;",
        "make sure everyone we authorise to process Customer Personal Data is bound by confidentiality;",
        "take the technical and organisational measures described in “Security”;",
        "not sell Customer Personal Data, or use it for our own purposes beyond providing, securing and supporting the Service;",
        "not use Customer Personal Data to train AI models.",
      ],
    ],
  },
  {
    id: "security",
    title: "Security",
    blocks: [
      "Our measures include:",
      [
        "encryption in transit (HTTPS / TLS) for every connection, and encryption at rest (AES-256) by our database provider;",
        "isolation of each organisation’s data inside the database with row-level security, so a request can only read or change rows in organisations and workspaces its user belongs to;",
        "role-based access within each organisation (viewer, contributor, manager, PMO, admin);",
        "an audit log of changes to records, membership, roles and billing, readable by the Customer’s administrators;",
        "passwords of at least 10 characters with confirmed email addresses, or Microsoft sign-in; invitation links that work once, expire after 7 days and are stored only as a hash;",
        "card payments handled entirely by Stripe;",
        "staff access to production limited to those who need it. [[solicitor to confirm: describe access controls]]",
      ],
      <p key="security-link" className={textClass}>
        The{" "}
        <Link to="/security" className={linkClass}>
          Security page
        </Link>{" "}
        describes these measures. We may update them, provided the overall level of protection
        doesn’t fall.
      </p>,
    ],
  },
  {
    id: "subprocessors",
    title: "Subprocessors",
    blocks: [
      "The Customer gives general authorisation for us to use subprocessors. Our current subprocessors are:",
      <SubprocessorTable key="subprocessors" />,
      "We will give the Customer’s administrators at least 30 days’ notice by email before adding or replacing a subprocessor. The Customer may object on reasonable data protection grounds within that period; if we can’t reasonably address the objection, the Customer may end the affected part of the Service and receive a refund of any prepaid fees for the period after it ends. [[solicitor to confirm]]",
      "We impose data protection terms on each subprocessor that are no less protective than this DPA, and remain responsible to the Customer for their performance.",
    ],
  },
  {
    id: "transfers",
    title: "International transfers",
    blocks: [
      "Customer Personal Data is stored in the UK (London). Where a subprocessor processes it outside the UK, we make sure the transfer is covered by UK adequacy regulations or by appropriate safeguards (the UK International Data Transfer Agreement, or the UK Addendum to the EU Standard Contractual Clauses), as shown in the table above. [[solicitor to confirm]]",
    ],
  },
  {
    id: "assistance",
    title: "Assistance to the Customer",
    blocks: [
      [
        "Data subject requests: the Service lets the Customer find, correct, export and remove personal data. If we receive a request directly, we will pass it to the Customer without undue delay and won’t respond except on the Customer’s instructions.",
        "We will give the Customer reasonable help with data protection impact assessments, prior consultation with the ICO, and its security obligations, taking into account the nature of the processing and the information available to us.",
      ],
    ],
  },
  {
    id: "breaches",
    title: "Personal data breaches",
    blocks: [
      "We will notify the Customer without undue delay, and in any case within 48 hours, after becoming aware of a personal data breach affecting Customer Personal Data, so that the Customer can meet its 72-hour obligation to the ICO. [[solicitor to confirm: 48 hours]] We will describe the breach, its likely consequences and what we are doing about it, give further information as it becomes available, and take reasonable steps to contain it.",
    ],
  },
  {
    id: "end",
    title: "Deletion or return at the end",
    blocks: [
      "The Customer can export its data from the Service at any time, including when its organisation is read-only. When the Terms end and the organisation is closed, we will delete Customer Personal Data within 30 days, unless the law requires us to keep it. Our current database plan doesn’t keep automatic backups; when it does, backups will be kept for 7 days, and are not restored except to recover the Service. [[solicitor to confirm]]",
    ],
  },
  {
    id: "audits",
    title: "Information and audits",
    blocks: [
      "We will make available the information reasonably needed to show that we comply with Article 28 of the UK GDPR, including our subprocessors’ certifications and reports where they let us share them. Where that isn’t enough, the Customer may audit our compliance, at its own cost, no more than once a year (unless the ICO requires it or after a personal data breach), with at least 30 days’ notice, during business hours and under confidentiality. [[solicitor to confirm]]",
    ],
  },
  {
    id: "liability",
    title: "Liability and precedence",
    blocks: [
      "Liability under this DPA is subject to the liability section of the Terms. [[solicitor to confirm: data protection liability]]",
      "If this DPA and the Terms conflict on the processing of Customer Personal Data, this DPA wins. This DPA is governed by the law of Scotland, as the Terms are.",
    ],
  },
];

function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Agreement"
      intro="How we process personal data on your organisation’s behalf, under UK GDPR Article 28. It forms part of our Terms of service."
      sections={sections}
      printable
    />
  );
}
