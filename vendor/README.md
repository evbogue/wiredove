# Vendored protocol code

- `andfs/` is AndFS v1 at revision `e8a32f21aaa7c66d2a0b92673e11ed0919b75145` from https://github.com/evbogue/andfs. Its source files are kept unchanged; see its MIT license in `andfs/LICENSE`.
- `anproto/` is ANProto at revision `ddc040ca2d4218ffea9a531202ed21efcb3abfb7` from https://github.com/evbogue/ANProto. The signing code uses the upstream base64 helper and TweetNaCl implementation; retain their attribution notices.

Keep upstream files unchanged. Wiredove-specific AndFS upload authorization and HTTP handling live outside this directory.

- `cropperjs/` contains the unchanged Cropper.js 2.3.1 ESM distribution from the npm release, plus its MIT license. It is loaded on demand by the shared profile crop UI.
