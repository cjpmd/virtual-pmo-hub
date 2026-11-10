import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, SubprocessorTable, type LegalSection } from "@/components/marketing/legal-page";
import { siteHead } from "@/components/marketing/site-head";

// Draft for legal review (GL-7): not to be merged to main until the owner says so.
// [[placeholders]] are filled in after the review.
export const Route = createFileRoute("/privacy")({
  head: () =>
    siteHead(
      "Privacy notice — ORMO PMO",
      "How ORMO PMO collects and uses personal data: what we collect, why, how long we keep it, where it goes and your rights.",
    ),
  component: PrivacyPage,
});

const linkClass = "text-site-accent-strong hover:underline";
const textClass = "m-0 text-[15px] leading-[1.7] text-site-text-muted";

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    blocks: [
      "ORMO PMO is provided by [[legal entity name]], a company registered in Scotland with company number [[company number]], whose registered office is at [[registered office address]]. We are registered with the Information Commissioner’s Office under number [[ICO registration number]].",
      "For questions about this notice or your personal data, email [[privacy contact email]].",
    ],
  },
  {
    id: "roles",
    title: "When we are the controller, and when we aren’t",
    blocks: [
      "We are the controller of the personal data we need to run our business: your account, sign-in and usage information, billing contacts, and enquiries you send us. This notice covers that data.",
      <p key="processor" className={textClass}>
        The records an organisation keeps in ORMO PMO (its projects, risks, decisions, reports and
        the names of the people in them) belong to that organisation. For those, the organisation is
        the controller and we are its processor, under our{" "}
        <Link to="/dpa" className={linkClass}>
          Data Processing Agreement
        </Link>
        . If your question is about that content, please contact the organisation; we will help it
        respond.
      </p>,
    ],
  },
  {
    id: "collect",
    title: "What we collect",
    blocks: [
      [
        "Account details: your name, email address, password (stored only as a secure hash), and, if you sign in with Microsoft, the name and email address your Microsoft account shares with us.",
        "Organisation and membership details: the organisations and workspaces you belong to, your roles, and invitations you send or receive.",
        "Usage and technical information: sign-in times, the changes you make (kept in the organisation’s audit log), IP address, browser and device information in our providers’ server logs, and errors.",
        "Content: what you and your colleagues enter, upload or generate in the Service, including AI drafts you ask for.",
        "Billing information: the billing contact’s name, email and address, VAT number, and subscription history. Card details are collected directly by Stripe; we never see or store them.",
        "Email delivery: whether emails we send you were delivered or bounced.",
        "Correspondence: what you send us when you contact us or ask for access.",
      ],
    ],
  },
  {
    id: "use",
    title: "How we use it, and our lawful bases",
    blocks: [
      [
        "To provide the Service: creating and securing your account, signing you in, showing you your organisation’s data, and sending account, invitation, notification and billing emails. Lawful basis: performance of our contract with your organisation, and our legitimate interest in providing a service your organisation has asked us to provide to you.",
        "To bill for the Service and keep accounting and tax records. Lawful basis: contract, and legal obligation.",
        "To keep the Service secure, prevent misuse and fix problems. Lawful basis: legitimate interests.",
        "To improve the Service, using aggregated information that doesn’t identify you. Lawful basis: legitimate interests.",
        "To answer your enquiries. Lawful basis: legitimate interests.",
        "To meet legal obligations, and to establish or defend legal claims. Lawful basis: legal obligation, and legitimate interests.",
      ],
      "We don’t sell personal data, show advertising, or use personal data for automated decision-making with legal or similarly significant effects. AI drafting runs only when a user asks for a draft, and the result is reviewed by a person. [[solicitor to confirm: legitimate interests assessment]]",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    blocks: [
      "We use only what the Service needs to work: browser storage that keeps you signed in and remembers your settings, such as the theme. We don’t use advertising or analytics cookies. Because these are strictly necessary, we don’t ask for consent. [[solicitor to confirm]]",
    ],
  },
  {
    id: "sharing",
    title: "Who we share it with",
    blocks: [
      "We use the service providers below to run ORMO PMO. They process personal data only on our instructions and under contracts that require them to protect it.",
      <SubprocessorTable key="subprocessors" />,
      "Other people in your organisation see your name, role and the work you do there, as the organisation’s settings allow. We may also disclose personal data where the law requires it, or to a buyer of our business, who would be bound by this notice.",
    ],
  },
  {
    id: "transfers",
    title: "International transfers",
    blocks: [
      "Our database and file storage are in London. Some providers process data outside the UK, as the table above shows. Where they do, the transfer is protected by UK adequacy regulations, the UK International Data Transfer Agreement, or the UK Addendum to the EU Standard Contractual Clauses. Contact us for more detail. [[solicitor to confirm]]",
    ],
  },
  {
    id: "retention",
    title: "How long we keep it",
    blocks: [
      [
        "Account details: while your account is open. If you close your account, we delete or anonymise your account details within [[account deletion period]] days; records you authored stay with your organisation.",
        "Organisation content: for as long as the organisation exists. An organisation whose trial or subscription has lapsed becomes read-only; we don’t delete its data for that reason. When an organisation is closed, its data is deleted within [[deletion period after closure]] days.",
        "Billing records: six years after the end of the financial year they relate to, for tax purposes. [[solicitor to confirm]]",
        "Server and security logs: [[log retention period]].",
        "Backups: copies of deleted data can remain in backups until they are overwritten, on our database provider’s normal cycle of [[backup retention period]]. We don’t restore deleted data from backups except to recover the Service.",
      ],
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    blocks: [
      "Under UK data protection law you have the right to ask for a copy of your personal data, to have it corrected or erased, to restrict or object to how we use it, and to receive it in a portable form. Where we rely on consent, you can withdraw it at any time.",
      "To exercise a right, email [[privacy contact email]]. We will reply within one month. For content your organisation controls, we will pass your request to the organisation.",
    ],
  },
  {
    id: "security",
    title: "Security",
    blocks: [
      <p key="security" className={textClass}>
        Connections are encrypted, data is encrypted at rest, and each organisation’s data is kept
        apart inside the database. Our{" "}
        <Link to="/security" className={linkClass}>
          Security page
        </Link>{" "}
        has the details.
      </p>,
    ],
  },
  {
    id: "complaints",
    title: "Complaints",
    blocks: [
      "If you’re unhappy with how we have handled your personal data, please tell us first at [[privacy contact email]]. You also have the right to complain to the Information Commissioner’s Office (ICO): ico.org.uk/make-a-complaint, or 0303 123 1113.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this notice",
    blocks: [
      "We will update this notice when how we handle personal data changes. The “last updated” date above shows the current version; we will email administrators about material changes.",
    ],
  },
];

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      intro="How ORMO PMO collects, uses and protects personal data, and the rights you have."
      sections={sections}
    />
  );
}
