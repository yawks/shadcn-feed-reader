// DEPRECATED: This file was a partial TS port of a Python readability implementation.
// The project now uses Mozilla's `@mozilla/readability` via `/src/lib/article-extractor.ts`.
//
// Keep a tiny compatibility shim to avoid accidental runtime import breakage. Do not
// use this file for new development — remove it once all references are gone.

export function deprecatedReadability() {
  throw new Error(
    "src/lib/readability.ts is deprecated. Use '@/lib/article-extractor' (extractArticle) instead."
  );
}