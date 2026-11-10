import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { siteHead } from "@/components/marketing/site-head";
import { TERMS_VERSION } from "@/lib/legal";

// Draft for legal review (GL-7): not to be merged to main until the owner says so.
// [[placeholders]] are filled in after the review.
export const Route = createFileRoute("/terms")({
  head: () =>
    siteHead(
      "Terms of service — ORMO PMO",
      "The terms on which organisations use ORMO PMO: accounts, the free trial, seats and billing, customer data, AI drafting, liability and termination.",
    ),
  component: TermsPage,
});

const linkClass = "text-site-accent-strong hover:underline";

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    blocks: [
      "ORMO PMO (the “Service”) is provided by [[legal entity name]], a company registered in Scotland with company number [[company number]], whose registered office is at [[registered office address]] (“we”, “us”). You can contact us at [[contact email]].",
      "These terms form a contract between us and the organisation that creates or subscribes to an ORMO PMO organisation (the “Customer”, “you”). The person who accepts them confirms that they have authority to bind the Customer. The Service is for business use only; it is not offered to consumers.",
      <p key="dpa" className="m-0 text-[15px] leading-[1.7] text-site-text-muted">
        Our{" "}
        <Link to="/dpa" className={linkClass}>
          Data Processing Agreement
        </Link>{" "}
        (the “DPA”) forms part of these terms and applies whenever we process personal data on your
        behalf. Our{" "}
        <Link to="/privacy" className={linkClass}>
          Privacy notice
        </Link>{" "}
        explains how we handle personal data for which we are the controller. If these terms and the
        DPA conflict on the processing of personal data, the DPA wins.
      </p>,
      `You accept these terms when you create an account or an organisation, or when you use the Service. This is version ${TERMS_VERSION}.`,
    ],
  },
  {
    id: "accounts",
    title: "Accounts and administrators",
    blocks: [
      "Each person who uses the Service needs their own account, with a confirmed email address or a Microsoft work account. Accounts must not be shared.",
      "The person who creates an organisation becomes its first administrator. Administrators invite people, set their roles, manage seats and billing, and can remove people. You are responsible for who you give access to, for what your users do in the Service, and for keeping sign-in details secure. Tell us promptly at [[contact email]] if you suspect unauthorised access.",
    ],
  },
  {
    id: "trial",
    title: "Free trial",
    blocks: [
      "A new organisation gets a free trial of 14 days, with no card needed. During the trial the organisation may have up to 10 paid seats and any number of viewers.",
      "When the trial ends without a subscription, the organisation becomes read-only (see “Read-only access”). Nothing is deleted.",
      "The trial is provided as it is, without the commitments on availability and support in these terms. [[solicitor to confirm]]",
    ],
  },
  {
    id: "billing",
    title: "Seats, prices and billing",
    blocks: [
      [
        "The Service is charged per paid seat: £10 per seat per month, or £100 per seat per year, excluding VAT.",
        "Administrators and members (including the project manager and PMO roles) use a paid seat. Viewers, who can read but not change anything, are free.",
        "Payment is by card through our payment provider, Stripe. We never see or store card details. VAT is added at checkout where it applies.",
        "Subscriptions renew automatically at the end of each monthly or annual period until cancelled.",
        "Seats added during a period are charged straight away for the rest of that period. Seat reductions, switches between monthly and annual billing, and cancellations take effect at the next renewal. We don't refund part of a period.",
        "We may change our prices by giving administrators at least 30 days’ notice by email. A change applies from your next renewal after the notice period. [[solicitor to confirm]]",
      ],
    ],
  },
  {
    id: "read-only",
    title: "Read-only access",
    blocks: [
      "If the trial ends without a subscription, or a subscription is cancelled, unpaid, or past due for more than 14 days after a failed payment, the organisation becomes read-only. Your users can still sign in, read and export everything, and administrators can subscribe again to restore full access straight away.",
      "While an organisation is read-only, administrators can still remove members, change members to viewers and manage the subscription.",
      "We don’t delete your data because a subscription has lapsed. Data is deleted only as described in “Termination and export”.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    blocks: [
      "You must not, and must not let anyone else:",
      [
        "break the law, or infringe anyone’s rights, through the Service;",
        "upload malicious code, or content that is unlawful, defamatory or harassing;",
        "try to get into another organisation’s data, or test, probe or get around our security, except under a written agreement with us;",
        "overload the Service, or use automated means to access it other than through features we provide;",
        "resell, sublicense or provide the Service to third parties, or use it to build a competing product;",
        "copy, modify or reverse engineer the Service, except as the law allows.",
      ],
      "We may suspend a user or an organisation where we reasonably believe these rules have been broken, or to protect the Service or other customers. We will tell you why and restore access once the problem is resolved, unless the law prevents it.",
    ],
  },
  {
    id: "customer-data",
    title: "Your data",
    blocks: [
      "Everything you and your users put into the Service (“Customer Data”) belongs to you. You give us a licence to host, copy, process and show Customer Data only as needed to provide, secure and support the Service for you, and as the DPA allows.",
      "You are responsible for Customer Data: for having the right to put it into the Service, and for its accuracy.",
      "We may use anonymous, aggregated information about how the Service is used (for example, how often a feature is used) to run and improve the Service. It never identifies you, your users or Customer Data. [[solicitor to confirm]]",
    ],
  },
  {
    id: "ai",
    title: "AI drafting",
    blocks: [
      "Some features draft text, such as report summaries, using a third-party AI model (currently Anthropic). Drafting runs only when a user asks for it, and uses only the records needed for that draft.",
      "AI drafts can be wrong or incomplete. They are a starting point: a person must review a draft before relying on it or publishing it, and you are responsible for what you publish. We don’t guarantee the accuracy of AI output.",
      "Anthropic commits under its commercial terms not to train its models on content sent through its API. We don’t use Customer Data to train AI models.",
    ],
  },
  {
    id: "ours",
    title: "Our service and intellectual property",
    blocks: [
      "We own the Service, its software and its content, other than Customer Data. These terms give you the right to use the Service during your subscription; they transfer no other rights.",
      "If you send us feedback or suggestions, we may use them without any obligation to you.",
    ],
  },
  {
    id: "availability",
    title: "Availability and changes",
    blocks: [
      "We use reasonable care and skill to keep the Service available and working, but we don’t promise that it will be uninterrupted or error-free. We may need to take it down for maintenance; where we can, we will plan this outside UK working hours.",
      "We improve the Service over time and may change or remove features. If we remove a feature that is material to your use, we will tell administrators in advance where we reasonably can.",
      "Support is by email at the address shown in the Service.",
    ],
  },
  {
    id: "liability",
    title: "Liability",
    blocks: [
      "Nothing in these terms limits or excludes liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, for your obligation to pay fees, or for anything else that cannot be limited or excluded by law.",
      "Subject to that, neither party is liable for any loss of profit, revenue, business, goodwill or anticipated savings, or for any indirect or consequential loss, however it arises.",
      "Subject to the above, each party’s total liability arising out of or in connection with these terms in any 12-month period, whether in contract, delict (including negligence), breach of statutory duty or otherwise, is limited to the greater of (a) the fees paid and payable by you for the Service in the 12 months before the event giving rise to the claim, and (b) [[minimum liability amount]].",
      "Data protection: each party’s liability for breach of the DPA or of data protection law is [[solicitor to confirm: a separate cap, or the general cap above]].",
      "The Service is provided for project and portfolio management. It isn’t professional, financial or legal advice, and you are responsible for decisions you make using it.",
    ],
  },
  {
    id: "termination",
    title: "Termination and export",
    blocks: [
      "You can cancel your subscription at any time in Settings › Subscription; it ends at the end of the current period. An organisation can be closed by its administrators.",
      "Either party may end these terms by notice if the other materially breaches them and doesn’t put the breach right within 30 days of being asked to, or becomes insolvent.",
      "You can export your data from the Service at any time, including while the organisation is read-only. When an organisation is closed, we delete Customer Data within [[deletion period after closure]] days, except where the law requires us to keep it. Copies in our backups are overwritten on the backup provider’s normal cycle. [[solicitor to confirm]]",
      "The sections on your data, liability, and governing law survive the end of these terms.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    blocks: [
      "We may update these terms. We will email administrators at least 30 days before a material change takes effect. If you don’t agree, you can cancel before it takes effect; continuing to use the Service after that date means you accept the change. The “last updated” date above shows the current version.",
    ],
  },
  {
    id: "general",
    title: "General",
    blocks: [
      [
        "Neither party is liable for delays or failures caused by events beyond its reasonable control.",
        "You may not transfer these terms without our written consent. We may transfer them to a group company or to a buyer of our business, with notice to you.",
        "These terms, with the DPA and any order made through the Service, are the entire agreement between us about the Service.",
        "If any part of these terms is found unenforceable, the rest stays in force.",
        "No one other than the parties has any right to enforce these terms. [[solicitor to confirm: Contract (Third Party Rights) (Scotland) Act 2017]]",
        "Notices to you go to your administrators’ email addresses; notices to us go to [[contact email]].",
      ],
    ],
  },
  {
    id: "law",
    title: "Governing law",
    blocks: [
      "These terms, and any dispute or claim arising out of or in connection with them, are governed by the law of Scotland. The Scottish courts have exclusive jurisdiction. [[solicitor to confirm]]",
    ],
  },
];

function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="The terms on which your organisation uses ORMO PMO. They include our Data Processing Agreement."
      sections={sections}
    />
  );
}
