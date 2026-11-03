// Report builder §11 (Phase 3): server-side PDF of a published pack. Called by the
// report-publish edge function with a short-lived print token; renders
// <app>/report-print/<id>?token=… in headless Chromium and stores the PDF at
// report-pdfs/<organisation>/<report>.pdf in Supabase Storage. The distribution email then
// attaches it.
//
// Behind a feature flag (RB decisions §21 q3): REPORT_SERVER_PDF must be "true" here AND in
// the Supabase function secrets; off by default, and browser print stays the fallback.
// Netlify environment: REPORT_SERVER_PDF, REPORT_PDF_SECRET (shared with report-publish),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// REPORT_CHROMIUM_PACK_URL: where the Chromium pack (chromium-v<version>-pack.<arch>.tar from
// the @sparticuz/chromium release matching @sparticuz/chromium-min) is downloaded from at cold
// start; host it on storage you control. Dependencies live in netlify/functions/package.json
// (`npm --prefix netlify/functions ci`), not in the app's package.json (RB-35).
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req: Request) => {
  if (process.env.REPORT_SERVER_PDF !== "true")
    return json({ error: "Server PDF is off (REPORT_SERVER_PDF)." }, 404);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = process.env.REPORT_PDF_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return json({ error: "Unauthorised" }, 401);
  const body = (await req.json().catch(() => ({}))) as {
    report_id?: string;
    token?: string;
    app_url?: string;
  };
  if (!body.report_id || !UUID.test(body.report_id) || !body.token || !body.app_url)
    return json({ error: "report_id, token and app_url are required" }, 400);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: report, error } = await supabase
    .from("reports")
    .select("id, organisation_id, status")
    .eq("id", body.report_id)
    .maybeSingle();
  if (error || !report || report.status !== "published")
    return json({ error: "Published report not found" }, 404);

  // Loaded on demand so the app build never needs Chromium.
  const packUrl = process.env.REPORT_CHROMIUM_PACK_URL;
  if (!packUrl) return json({ error: "REPORT_CHROMIUM_PACK_URL is not set." }, 500);
  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    args: chromium.args,
    // chromium-min ships no binary: it downloads and unpacks the pack into /tmp (cached per instance).
    executablePath: await chromium.executablePath(packUrl),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const url = `${body.app_url.replace(/\/$/, "")}/report-print/${report.id}?token=${encodeURIComponent(body.token)}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 20_000 });
    await page.waitForSelector('[data-ready="true"]', { timeout: 10_000 });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const path = `${report.organisation_id}/${report.id}.pdf`;
    const upload = await supabase.storage
      .from("report-pdfs")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upload.error) return json({ error: upload.error.message }, 500);
    return json({ path, bytes: pdf.length });
  } finally {
    await browser.close();
  }
};

export const config = { path: "/api/report-pdf" };
