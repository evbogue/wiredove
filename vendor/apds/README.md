# Pinned APDS YAML parser

`yaml.js` is copied byte-for-byte from evbogue/apds at `d9326cb`,
`lib/yaml.js` (Git blob `8e612a6a837ab9b3fe0f761324bc875e0fd1e359`).
It bundles @std/yaml 1.0.5 and @std/front-matter 1.0.5 plus their compiled
dependencies, and the APDS front-matter/body wrapper. Keep it unchanged.

Source: https://github.com/evbogue/apds/blob/d9326cb/lib/yaml.js
The bundled Deno standard-library code is MIT licensed; see LICENSE.
APDS's upstream revision does not have a separate repository license file.
This copy preserves the existing parser instead of changing YAML interpretation
when serving notifications and feed rows under Node. No browser imports change.
