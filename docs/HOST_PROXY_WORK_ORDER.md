# Independent host HTTPS proxy migration

Open, separated from the Wiredove application runtime migration on 2026-11-04.
Owner: Ev / host operator. Target: review and migrate before October 2027.
This work requires a separate release from the application cutover.

## Observed host inventory

Read-only inspection on 2026-11-04 found:

- `reverse-proxy.service`: `/root/reverse-proxy/serve.js`, custom Deno TLS proxy on
  443; `domains.json` holds 21 entries (backend ports and 308 redirects).
- `/etc/letsencrypt/live/wiredove.net/{fullchain,privkey}.pem`, shared SAN cert;
  `certbot.timer` active. Preserve all names, renewals and certificate permissions.
- `http-redirect.service`: separate Deno HTTP → HTTPS service.
- WebSocket upgrade forwarding includes binary SSB handshakes; do not test only HTTP.
- Optional raw TCP forwarding (`tcp_proxy.js`); `tcp.json` currently empty.
- Domains include evbogue.com, bogbook.com, anproto.com, Wiredove, SSB, presentations,
  meetup applications and redirects. The proxy does not belong solely to Wiredove.

Other observed Deno process working directories: `/root/apds`, `/root/ANProto`
(two processes), `/root/evbogue.com`, `/root/sideeffects`, `/root/codeandcoffee`,
`/root/doorman`, `/root/presentation-anproto`, `/root/bogbook-v3`. These are explicit
exceptions outside the Wiredove application migration, owned by Ev / each project's
operator. Inventory/review them before October 2027; migrate in their own repositories.
Do not remove the host Deno executable or modify these apps during Wiredove releases.

## Completion

- [ ] Read host `/root/AGENTS.md`; preserve its custom proxy requirement unless Ev
  chooses a replacement. Evaluate maintained software against every existing feature.
- [ ] Inventory complete domains, HTTP redirects, websocket/binary behavior,
  streaming/backpressure, forwarding headers, TLS SANs/renewals and optional TCP.
- [ ] Back up private config/certificates and service units with restricted access.
- [ ] Stage the chosen proxy without occupying production ports; compare every
  domain/redirect, HTTP streaming, WebSocket binary echo and upstream failure behavior.
- [ ] Release independently, retaining a tested rollback to existing Deno proxy.
- [ ] Verify all domains, TLS renewals, WebSockets, redirect paths/query and logs;
  record actual source/service revisions in host operations instructions.

No proxy or unrelated application changes have been made by the Wiredove migration.
