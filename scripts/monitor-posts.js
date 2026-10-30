// Read-only, one-shot monitor. Schedule externally; stdout contains verified posts.
import { createWiredoveRelay } from "../client/relay.js";
import { isMessageHash } from "../client/protocol.js";
import { loadFeedProtocol } from "../client/feed.js";
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
      "Usage: deno run --allow-net --allow-read --allow-write scripts/monitor-posts.js <state.json>",
    );
  }
  const lock = await Deno.open(statePath + ".lock", {
    createNew: true,
    write: true,
  });
  try {
    const save = async (state) => {
      const temporary = statePath + "." + crypto.randomUUID() + ".tmp";
      try {
        await Deno.writeTextFile(temporary, JSON.stringify(state) + "\n", {
          mode: 0o600,
        });
        await Deno.rename(temporary, statePath);
      } finally {
        await Deno.remove(temporary).catch(() => {});
      }
    };
    let state;
    try {
      state = JSON.parse(await Deno.readTextFile(statePath));
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
      if (!(error instanceof Deno.errors.NotFound)) throw error;
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
          protocol ||= await loadFeedProtocol();
          return await resolveNotificationPost(reference, { protocol, relay });
        },
        report,
      });
    }
  } finally {
    lock.close();
    await Deno.remove(statePath + ".lock");
  }
}

if (import.meta.main) await runMonitor(Deno.args[0]);
