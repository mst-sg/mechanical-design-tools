# US SEO edge overlay

`mst-us-seo-edge` sits in front of three WordPress-served URLs on mst-us.ai
(`/robots.txt`, `/2d-cad-to-3d-model-generation/`, `/product/`). WordPress admin
is not available to this repository, so the Worker forwards each request to the
origin and applies only exact-string replacements:

- `robots.txt`: appends `Sitemap: https://mst-us.ai/sitemap.xml` once.
- `/2d-cad-to-3d-model-generation/`: title, meta, Open Graph and Twitter text
  that described the page only as Revit families.
- `/product/`: meta description and the matching JSON-LD sentence.

If the origin text no longer matches, nothing changes; non-200 responses, other
methods and any error return the origin response untouched. The visible H1 and
body copy of the drawing-to-model page are CMS content and are not rewritten.
Retire this Worker once the same text is fixed in WordPress. The response header
`X-MST-Edge-SEO` shows when a rewrite was applied.

Build with `npm run build:us-entry` (writes `us-entry-dist/seo-edge.mjs`).
