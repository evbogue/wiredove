import { WiredoveMessage, defineWiredoveMessage } from "./message.js";
import { WiredoveComposer, defineWiredoveComposer } from "./composer.js";
import { WiredoveThreadFeed, defineWiredoveThreadFeed } from "./feed.js";
import { WiredoveThread, defineWiredoveThread } from "./thread.js";
import { WiredoveWidget, defineWiredoveWidget } from "./widget.js";
import { WiredoveMedia, defineWiredoveMedia } from "./media.js";

export function defineWiredoveElements() {
  defineWiredoveMessage();
  defineWiredoveComposer();
  defineWiredoveThreadFeed();
  defineWiredoveThread();
  defineWiredoveWidget();
  defineWiredoveMedia();
  return { WiredoveMessage, WiredoveComposer, WiredoveThreadFeed, WiredoveThread, WiredoveWidget, WiredoveMedia };
}
