// skill-telemetry-ingest — Supabase Edge Function
//
// Receives a batch of skill-invocation events from telemetry-sync and
// inserts them into the skill_events table using the service-role key.
//
// Deploy (from skill repo root, after `supabase login`):
//
//   supabase functions deploy skill-telemetry-ingest --no-verify-jwt
//
// The --no-verify-jwt is required because we're authenticating via
// anon-key header, not Supabase Auth user JWTs.
//
// Environment variables (auto-populated by Supabase):
//   SUPABASE_URL              — your project URL
//   SUPABASE_SERVICE_ROLE_KEY — server-side key, bypasses RLS

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_OUTCOMES = new Set([
  "success",
  "error",
  "abandoned",
  "unknown",
]);

// Cap accepted batches so a misbehaving client can't fill the table
const MAX_BATCH = 100;

// Cap error_detail string length on the server side too (defense in depth)
const MAX_ERROR_DETAIL_LEN = 160;

type IncomingEvent = {
  ts?: string;
  skill?: string;
  outcome?: string | null;
  duration_s?: number | null;
  error_detail?: string | null;
  step?: string | null;
  session_id?: string | null;
  installation_id?: string | null;
};

function sanitize(e: IncomingEvent): Record<string, unknown> | null {
  // skill is the only required field
  if (!e.skill || typeof e.skill !== "string") return null;

  const outcome =
    e.outcome && ALLOWED_OUTCOMES.has(e.outcome) ? e.outcome : "unknown";

  let errorDetail: string | null = null;
  if (typeof e.error_detail === "string" && e.error_detail.length > 0) {
    errorDetail = e.error_detail.slice(0, MAX_ERROR_DETAIL_LEN);
  }

  let duration: number | null = null;
  if (
    typeof e.duration_s === "number" &&
    Number.isFinite(e.duration_s) &&
    e.duration_s >= 0 &&
    e.duration_s < 86_400 * 30 // sanity: <30 days
  ) {
    duration = Math.floor(e.duration_s);
  }

  // installation_id must look like a UUID or we drop it (don't fail
  // the row — just null it out so the rest of the event lands)
  let installId: string | null = null;
  if (
    typeof e.installation_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      e.installation_id,
    )
  ) {
    installId = e.installation_id.toLowerCase();
  }

  return {
    ts: typeof e.ts === "string" ? e.ts : new Date().toISOString(),
    skill: e.skill.slice(0, 200),
    outcome,
    duration_s: duration,
    error_detail: errorDetail,
    step: typeof e.step === "string" ? e.step.slice(0, 100) : null,
    session_id:
      typeof e.session_id === "string" ? e.session_id.slice(0, 200) : null,
    installation_id: installId,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!Array.isArray(body)) {
    return new Response("expected array", { status: 400 });
  }
  if (body.length === 0) {
    return new Response("ok", { status: 200 });
  }
  if (body.length > MAX_BATCH) {
    return new Response(`batch too large (max ${MAX_BATCH})`, {
      status: 413,
    });
  }

  const rows: Record<string, unknown>[] = [];
  for (const raw of body) {
    const clean = sanitize(raw as IncomingEvent);
    if (clean) rows.push(clean);
  }

  if (rows.length === 0) {
    // All rows were malformed but we don't want the client to retry
    // forever — return 200 so its cursor advances.
    return new Response("ok (no valid rows)", { status: 200 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await sb.from("skill_events").insert(rows);

  if (error) {
    return new Response(`insert failed: ${error.message}`, { status: 500 });
  }

  return new Response(`ok (${rows.length} inserted)`, { status: 200 });
});
