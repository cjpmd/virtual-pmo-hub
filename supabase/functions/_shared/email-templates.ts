// Work package 2.1 emails: invitation and join request. Plain inline-styled HTML (email clients
// ignore stylesheets) plus a text version. Every value from the database is escaped.
import { escapeHtml } from "./email.ts";

type Rendered = { subject: string; html: string; text: string };

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pmo: "Member (PMO)",
  manager: "Member (manager)",
  contributor: "Member",
  viewer: "Viewer (free, read-only)",
};
export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

/** "5 November 2026", in UK time. */
export const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(
    new Date(iso),
  );

function layout(preheader: string, heading: string, paragraphs: string[], button: { label: string; url: string }, footer: string) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2933;">${p}</p>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:24px 32px 0;font-size:14px;font-weight:700;letter-spacing:0.04em;color:#334e68;">ORMO PMO</td></tr>
<tr><td style="padding:16px 32px 8px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#102a43;">${escapeHtml(heading)}</h1>
${body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
<td style="border-radius:6px;background:#1f4e8c;"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 22px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(button.label)}</a></td>
</tr></table>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#52606d;">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#1f4e8c;word-break:break-all;">${escapeHtml(button.url)}</a></p>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #e4e7eb;font-size:12px;line-height:18px;color:#7b8794;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function inviteEmail(input: {
  organisationName: string;
  inviterName: string | null;
  role: string;
  link: string;
  expiresAt: string;
}): Rendered {
  const org = input.organisationName;
  const inviter = input.inviterName?.trim() || "An admin";
  const role = roleLabel(input.role);
  const expires = longDate(input.expiresAt);
  const subject = `${inviter} invited you to ${org} on ORMO PMO`;
  const html = layout(
    `Join ${org} on ORMO PMO as ${role}. The invitation expires on ${expires}.`,
    `Join ${org} on ORMO PMO`,
    [
      `${escapeHtml(inviter)} has invited you to join <strong>${escapeHtml(org)}</strong> on ORMO PMO as <strong>${escapeHtml(role)}</strong>.`,
      `Accept with this email address. You can sign in with Microsoft or with an email and password, or create an account if you don't have one.`,
      `This invitation expires on <strong>${escapeHtml(expires)}</strong> and can be used once.`,
    ],
    { label: "Accept invitation", url: input.link },
    `You received this because someone at ${escapeHtml(org)} invited this address to ORMO PMO. If you weren't expecting it, you can ignore this email: nothing happens unless you accept.`,
  );
  const text = [
    `${inviter} has invited you to join ${org} on ORMO PMO as ${role}.`,
    "",
    "Accept the invitation:",
    input.link,
    "",
    "Accept with this email address. You can sign in with Microsoft or with an email and password, or create an account if you don't have one.",
    `This invitation expires on ${expires} and can be used once.`,
    "",
    "If you weren't expecting this, you can ignore this email: nothing happens unless you accept.",
  ].join("\n");
  return { subject, html, text };
}

export function joinRequestEmail(input: {
  organisationName: string;
  requesterName: string | null;
  requesterEmail: string;
  matchedBy: string;
  message: string | null;
  link: string;
}): Rendered {
  const org = input.organisationName;
  const who = input.requesterName?.trim() || input.requesterEmail;
  const how =
    input.matchedBy === "entra_tenant"
      ? "they signed in with your organisation's Microsoft account"
      : "their email address is on one of your organisation's domains";
  const subject = `${who} asked to join ${org} on ORMO PMO`;
  const paragraphs = [
    `<strong>${escapeHtml(who)}</strong> (${escapeHtml(input.requesterEmail)}) asked to join <strong>${escapeHtml(org)}</strong>. They can ask because ${how}.`,
  ];
  if (input.message) paragraphs.push(`Their message: &ldquo;${escapeHtml(input.message)}&rdquo;`);
  paragraphs.push("Nobody joins until an admin approves. Approve with a role, or decline, on the Members page.");
  const html = layout(
    `${who} asked to join ${org}. Approve or decline on the Members page.`,
    "New request to join",
    paragraphs,
    { label: "Review the request", url: input.link },
    `You received this because you are an admin of ${escapeHtml(org)} on ORMO PMO, and join requests are switched on in Settings › Members.`,
  );
  const text = [
    `${who} (${input.requesterEmail}) asked to join ${org}. They can ask because ${how}.`,
    ...(input.message ? ["", `Their message: "${input.message}"`] : []),
    "",
    "Nobody joins until an admin approves. Approve with a role, or decline, on the Members page:",
    input.link,
    "",
    `You received this because you are an admin of ${org} on ORMO PMO, and join requests are switched on in Settings › Members.`,
  ].join("\n");
  return { subject, html, text };
}
