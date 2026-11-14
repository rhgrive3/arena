// Serves the single-file Vite build (dist/index.html) inlined into this Worker.
// Used by .github/workflows/deploy-games.yml. The HTML is bundled as text via
// the `Text` rule in wrangler.jsonc, so no separate asset upload is needed.
import html from "./dist/index.html";

export default {
  async fetch() {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  },
};
