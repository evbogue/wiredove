---
name: anproto-publish
description: Compose and publish ANProto messages to the Wiredove social network from the CLI using publish.js
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - deno
    emoji: "🐦"
    homepage: https://wiredove.net
    os: ["linux", "macos"]
---

# ANProto Publish

Compose and publish messages to the Wiredove ANProto social network using the
CLI script `publish.js` in this repository. The script uses the same ANProto
cryptographic library as the browser app and publishes directly to the
`pub.wiredove.net` relay.

## Prerequisites

- **Deno** installed (`deno --version`)
- Run all commands from the repository root where `publish.js` lives
- State is stored in `~/.anproto/state.json` (created automatically on first run)

## Deno run prefix

All subcommands use this prefix:

```
deno run --allow-net --allow-read --allow-write --allow-env publish.js
```

You can make `publish.js` executable and use the shebang directly:

```bash
chmod +x publish.js
./publish.js <cmd>
```

## Workflow

### 1. Check status

Always start by checking the current identity:

```
deno run --allow-net --allow-read --allow-write --allow-env publish.js status
```

Output shows:
- `Pubkey` – your 44-character ed25519 public key (your identity on the network)
- `Name` – your display name (shown in the feed)
- `Previous` – hash of your last published message (for chain continuity)

If no keypair is found, proceed to step 2.

### 2. Generate a keypair (first time only)

```
deno run --allow-net --allow-read --allow-write --allow-env publish.js genkey
```

This generates a new ed25519 keypair and saves it to `~/.anproto/state.json`.
Your public key is your permanent identity — share it so others can follow you.

Use `--force` only if you intentionally want a fresh identity (orphans your
existing message chain).

### 3. Set a display name (first time only)

```
deno run --allow-net --allow-read --allow-write --allow-env publish.js profile --name "Your Name"
```

The name is embedded in every message you publish. You can change it at any
time; the change takes effect on the next post.

### 4. Publish a message

```
deno run --allow-net --allow-read --allow-write --allow-env publish.js post "Hello from the CLI!"
```

On success the script prints:
```
Published: <44-char message hash>
URL: https://wiredove.net/#<hash>
```

The hash is your message's permanent identifier on the network.

### 5. Reply to a message

```
deno run --allow-net --allow-read --allow-write --allow-env publish.js reply <hash> "My reply text"
```

The `<hash>` is the 44-character hash of the message you are replying to
(visible in the wiredove.net URL or from the `Published:` output of a prior
`post` command).

### 6. Verify the message was received

Poll the relay gossip endpoint to confirm both blobs landed:

```bash
curl -s "https://pub.wiredove.net/gossip/poll?since=$(( $(date +%s%3N) - 60000 ))" | \
  python3 -m json.tool
```

The response JSON has a `messages` array. Locate your signed blob (starts with
your 44-char pubkey). The raw YAML content blob should also be present so peers
can fetch it by its content hash.

## How it works (ANProto protocol)

Each published message involves two blobs sent to the relay:

1. **Signed blob** – `pubkey(44) + base64(nacl.sign(timestamp + contentHash, secretKey))`
   — verifiable proof of authorship
2. **YAML content blob** – front-matter metadata + message body
   — fetchable by its SHA-256 hash so peers can read the text

The YAML format:

```yaml
---
name: Your Name
previous: <hash of your last message>
---
Your message body goes here.
```

Optional fields for replies: `reply: <hash>`, `replyto: <pubkey>`.

The `previous` field links each message to the prior one, forming a verifiable
chain that peers use to sync your full feed history.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No keypair found` | Run `genkey` first |
| `Relay rejected blobs` | Check network; relay may be temporarily down |
| Message not appearing | Wait ~30 s for propagation; reload wiredove.net |
| Wrong name in posts | Run `profile --name <name>` then post again |
