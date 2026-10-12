// Leaving a page abandons the database reads it started. supabase-js calls the global fetch on
// every request, so one wrapper covers every service without touching the generated client.
// Only REST reads (GET/HEAD) are tied to the page; writes and RPCs (which can write) never are.
// Note: this frees the browser's connections; PostgREST may still finish a running statement.
let controller = new AbortController();
let installed = false;

export function installPageReadAbort(supabaseUrl: string) {
  if (installed || !supabaseUrl || typeof window === "undefined") return;
  installed = true;
  const restBase = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/`;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (!url.startsWith(restBase) || (method !== "GET" && method !== "HEAD"))
      return original(input, init);
    const page = controller.signal;
    const signal = init?.signal ? AbortSignal.any([init.signal, page]) : page;
    return original(input, { ...init, signal });
  };
}

/** Abandons every read started on the current page; reads started afterwards are unaffected. */
export function abortPageReads() {
  controller.abort(new DOMException("Left the page", "AbortError"));
  controller = new AbortController();
}
