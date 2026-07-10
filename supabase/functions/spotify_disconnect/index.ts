import { adminClient, getCallerUid } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', undefined, 405);

  const callerUid = await getCallerUid(req);
  if (!callerUid) return errorResponse('unauthorized', 'Be kell jelentkezni.', 401);

  const { error } = await adminClient().from('spotify_connections').delete().eq('host_uid', callerUid);
  if (error) return errorResponse('db_error', 'Nem sikerült kijelentkezni a Spotify-fiókból.', 500);

  return jsonResponse({ ok: true });
});
