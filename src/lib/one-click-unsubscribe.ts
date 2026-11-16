// RFC 8058 one-click unsubscribe (GL-13). Notification emails carry
//   List-Unsubscribe: <https://…/notifications/unsubscribe?token=…>
//   List-Unsubscribe-Post: List-Unsubscribe=One-Click
// and mail clients POST "List-Unsubscribe=One-Click" to that URL. The route's server handler
// passes the request here; the token is in the query string, as in the link.
export async function handleOneClickUnsubscribe(
  request: Request,
  unsubscribe: (token: string) => Promise<boolean>,
): Promise<Response> {
  const text = (body: string, status: number) =>
    new Response(body, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return text("This unsubscribe link isn't valid.", 400);
  try {
    return (await unsubscribe(token))
      ? text("You're unsubscribed from ORMO PMO notification emails.", 200)
      : text("This unsubscribe link has expired or isn't valid.", 400);
  } catch {
    return text("We couldn't unsubscribe you just now. Try again later.", 502);
  }
}
