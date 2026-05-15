// YouTube Search proxy — Supabase Edge Function
// ────────────────────────────────────────────────
// Receives `{ q: "..." }` via POST, queries YouTube Data API v3 for matching
// videos and playlists, and returns a flattened list the frontend can render
// as a dropdown.
//
// Required secret (set with: `supabase secrets set YOUTUBE_API_KEY=...`):
//   YOUTUBE_API_KEY   — from Google Cloud Console, with YouTube Data API v3 enabled

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let q: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      q = body?.q ? String(body.q) : null;
    } catch (_) { /* swallow */ }
  } else {
    q = new URL(req.url).searchParams.get("q");
  }

  if (!q || !q.trim()) {
    return new Response(JSON.stringify({ error: "Missing or empty `q`" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing YOUTUBE_API_KEY secret" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", q.trim());
    url.searchParams.set("type", "video,playlist");
    url.searchParams.set("maxResults", "8");
    url.searchParams.set("safeSearch", "none");
    // Note: videoEmbeddable / videoSyndicated etc. are video-only filters and
    // YouTube rejects them when `type` includes anything other than `video`.
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`YouTube search failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();

    const results = (data.items ?? []).filter(Boolean).map((item: any) => {
      const kind = item.id?.kind === "youtube#video"    ? "video"
                 : item.id?.kind === "youtube#playlist" ? "playlist"
                 : "other";
      const id   = item.id?.videoId || item.id?.playlistId || null;
      if (!id || kind === "other") return null;
      return {
        kind,
        id,
        name:    item.snippet?.title || "",
        artists: item.snippet?.channelTitle || "",
        image:   item.snippet?.thumbnails?.medium?.url
              || item.snippet?.thumbnails?.default?.url
              || null,
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
