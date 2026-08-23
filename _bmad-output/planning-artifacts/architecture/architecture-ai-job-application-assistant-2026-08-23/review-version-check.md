# Review: Version / Reality Check — ARCHITECTURE-SPINE.md

**Reviewer directive:** verify load-bearing stack claims against the web (versions verified separately earlier today; this review targets claims that would break the architecture if wrong).
**Date:** 2026-08-23
**Scope:** Stack section + AD-4 (client parsing/export), AD-5 layer 2 (responseSchema), AD-1 (Hono static serving).

---

## Verdict: PASS (with minor findings)

No claim, if wrong, would invalidate the architecture. Every load-bearing claim was re-verified live on 2026-08-23 and holds. Three integration-level caveats are worth one line each in the spine before build starts.

## Verified claims

| Claim | Source checked | Result |
| --- | --- | --- |
| Gemini free tier exists for Flash models | ai.google.dev/gemini-api/docs/pricing | ✅ Free tier confirmed ("Free of charge" input/output on Flash tiers) |
| responseSchema / structured output support | ai.google.dev/gemini-api/docs/structured-output (+ generate-content variant) | ✅ Supported on all actively maintained Gemini models incl. Flash line (3.x, 2.5); JSON Schema subset; native Zod via GenAI JS SDK |
| `docx` browser-side export (AD-4) | docx.js.org/api/classes/Packer.html, github.com/dolanmiu/docx docs | ✅ `Packer.toBlob(doc)` documented "for browser environments"; library works in browsers, workers, Node |
| `mammoth` browser usage (AD-4) | npmjs.com/package/mammoth | ✅ v1.12.1 current (matches "1.12+"); browser input `{arrayBuffer}`; use `mammoth/mammoth.browser` standalone build (CJS — Vite pre-bundles fine) |
| `pdfjs-dist` browser text extraction (AD-4) | npmjs.com/package/pdfjs-dist | ✅ v6.2.108 published 2026-07-28 — matches "6.x" |
| Hono static file serving (AD-1) | hono.dev/docs/getting-started/nodejs, @hono/node-server README | ✅ `serveStatic` from `@hono/node-server/serve-static`; serves `index.html` by default; range requests, traversal protection |
| Node.js 24 LTS | nodejs.org release schedule, nodejs/Release repo | ✅ 24.x 'Krypton' Active LTS; note: transitions to Maintenance 2026-10-20 (supported through 2028-04) |

## Findings

### F-1 — LOW — pdfjs-dist Vite integration gotchas unmentioned
**Location:** AD-4 / Stack table (pdfjs-dist row).
**Detail:** pdf.js ≥4 requires explicit worker wiring in Vite (`import pdfWorker from 'pdfjs-dist/build/pdf.worker?worker'` → `GlobalWorkerOptions.workerPort`, or `workerSrc` via `?url`). Since v5, some PDFs additionally need `wasmUrl` for image-decoder WASM (rarely triggered by text-only extraction). Neither breaks the architecture, but both are classic day-one build blockers.
**Fix:** one line in AD-4: "pdfjs worker via Vite `?worker` import; set `wasmUrl` if image decode errors surface."

### F-2 — LOW — Gemini structured output is a JSON Schema *subset*
**Location:** AD-5, layer 2 (`responseSchema фиксирует форму ответа`).
**Detail:** Google docs state very large/deeply nested schemas may be rejected and only a subset of JSON Schema keywords is supported. The generate contract (resume sections, arrays of strings) fits comfortably within the subset, so the decision stands — but the repair-retry layer must also handle HTTP 400 from an oversized schema, not just invalid output.
**Fix:** add "schema rejected by provider" to the retry/failure path in FR-10 mapping (`LLM_INVALID_OUTPUT`).

### F-3 — LOW — Hono serveStatic has no SPA history-API fallback
**Location:** AD-1 ("Node-процесс отдаёт собранную статику SPA").
**Detail:** `@hono/node-server/serve-static` serves files and `index.html` for directories but does not rewrite unknown paths (e.g., `/settings`) to `index.html`. If the SPA ever adds client-side routing, deep links 404. Single-view MVP is unaffected.
**Fix:** none now; when routing is added, use a catch-all route returning `index.html`.

## Notes

- Node 24 enters Maintenance LTS ~2 months from the doc date (2026-10-20). Harmless for the project lifetime (EOL 2028-04); no action needed.
- Free-tier rate limits (RPD/RPM per model) exist; spine already covers this via AD-6 limits and Deferred rate-limiting-per-IP. Consistent.
- pdf-lib Cyrillic claim ("embedded Noto Sans") not web-rechecked here: stable behavior (standard fonts are WinAnsi-only, custom fonts require fontkit + bundled TTF), low drift risk. Flagged as the one remaining training-data-based claim in the Stack table.

**Bottom line:** the "Верифицировано вебом 2026-08-23" stamp is accurate for every architecture-breaking claim. Apply F-1/F-2 as one-line amendments at next spine touch.
