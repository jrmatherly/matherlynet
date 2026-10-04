import type { APIRoute } from "astro";
import { parseCall, respond } from "../../lib/playground-io";

// POST only, so every other method gets Astro's 404. Form-encoded only (parseCall), so Astro's origin check has already
// refused a cross-site POST, and a POST with no Origin header, before this runs.
export const POST: APIRoute = async ({ request, locals }) => {
  const call = await parseCall(request, locals.user?.id ?? null);
  return call.ok ? respond(call.value, request.signal) : new Response(null, { status: call.status });
};
