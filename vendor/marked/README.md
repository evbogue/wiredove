# Marked (vendored)

This is the same pinned Markdown parser previously imported by `markdown.js`,
now served locally for individually importable widgets and offline app upgrades.

Source: https://esm.sh/gh/evbogue/bog5@de70376265/es2022/lib/marked.esm.mjs
Upstream: https://github.com/markedjs/marked (MIT license)

The application uses its lexer and constructs safe DOM nodes itself. Raw HTML is
shown as text; image galleries never reconstruct content through HTML regexes.
