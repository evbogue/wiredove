import * as fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createProtocol } from "../client/protocol.js";
import { an } from "../vendor/anproto/an.js";
import { yaml } from "../vendor/apds/yaml.js";
// Read-only, one-shot monitor. Schedule externally; stdout contains verified posts.
import { createWiredoveRelay } from "../client/relay.js";
import { isMessageHash } from "../client/protocol.js";
import {
  consumeNotifications,
  resolveNotificationPost,
} from "../post_notifications.js";

export async function runMonitor(
  statePath,
  {
    fetchImpl = fetch,
    protocol,
    relay,
    report = async (post) =>
      console.log(
        JSON.stringify({
          id: post.id,
          author: post.author,
          timestamp: post.timestamp,
          body: post.parsed?.body || "",
          url: "https://wiredove.net/#" + post.id,
        }),
      ),
    info = (message) => console.error(message),
  } = {},
) {
  if (!statePath) {
    throw new Error(
      "Usage: node scripts/monitor-posts.js <state.json>",
    );
  }
  const lock = await fs.open(statePath + ".lock", "wx", 0o600);
  try {
    const save = async (state) => {
      const temporary = statePath + "." + crypto.randomUUID() + ".tmp";
      try {
        await fs.writeFile(temporary, JSON.stringify(state) + "\n", {
          mode: 0o600,
        });
        await fs.rename(temporary, statePath);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
    };
    let state;
    try {
      state = JSON.parse(await fs.readFile(statePath, "utf8"));
      if (
        !state || state.version !== 1 || typeof state.cursor !== "string" ||
        !/^[A-Za-z0-9]+$/.test(state.cursor) ||
        !Array.isArray(state.seen) || state.seen.some((id) =>
          !isMessageHash(id)
        )
      ) {
        throw new Error(
          "Invalid monitor state; restore its backup rather than silently resetting the cursor",
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const url = new URL("https://ntfy.sh/wiredove/json");
    url.searchParams.set("poll", "1");
    url.searchParams.set("since", state?.cursor || "all");
    const requestedAt = Math.floor(Date.now() / 1000);
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`ntfy returned ${response.status}; cursor unchanged`);
    }
    const entries = (await response.text()).split("\n").filter(Boolean).map(
      (line) => JSON.parse(line),
    )
      .filter((entry) => entry.event === "message");
    if (!state) {
      // First invocation establishes a baseline, without reporting cached history.
      // An empty cache uses a timestamp cursor so the next run does not replay history.
      await save({
        version: 1,
        cursor: entries.at(-1)?.id || String(requestedAt),
        seen: [],
      });
      info(
        "Baseline saved; subsequent runs report newly received, verified posts.",
      );
    } else {
      relay ||= createWiredoveRelay({ baseURL: "https://pub.wiredove.net" });
      await consumeNotifications(entries, {
        state,
        save: (next) => save({ version: 1, ...next }),
        resolvePost: async (reference) => {
          protocol ||= createProtocol({ an, yaml });
          return await resolveNotificationPost(reference, { protocol, relay });
        },
        report,
      });
    }
  } finally {
    await lock.close();
    await fs.unlink(statePath + ".lock");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runMonitor(process.argv[2]);
