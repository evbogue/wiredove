import { defineWiredoveElements } from "./index.js";

defineWiredoveElements();

const ev = "5sviEaqlREqJlQzFKbIdU+gE7Tcp+osPJKUdKU9y9fs=";
const mira = "zL4C0KqfH6vWw3pJtYmQfL3eB6aN1sD8rV5cX9mH2kQ=";
const feedPosts = [
  {
    id: "feed-one",
    author: ev,
    timestamp: Date.now() - 1800000,
    parsed: {
      name: "Ev Bogue",
      body:
        "A feed is for discovery: each post stands on its own in chronological order.",
    },
  },
  {
    id: "feed-two",
    author: mira,
    timestamp: Date.now() - 8100000,
    parsed: {
      name: "Mira",
      body:
        "A feed provides the chronological view; it does not need a composer.",
    },
  },
  {
    id: "feed-media",
    author: ev,
    timestamp: Date.now() - 86400000,
    parsed: {
      name: "Ev Bogue",
      body: "AndFS media stays part of the message that published it.",
      type: "image",
      andfs: "demo",
      media_name: "Wiredove dove",
      media_url: location.origin + "/dovepurple_sm.png",
    },
  },
];
const threadRoot = {
  id: "thread-root",
  author: ev,
  timestamp: Date.now() - 7200000,
  parsed: {
    name: "Ev Bogue",
    body: "Should this page contain a thread or a feed?",
  },
};
const threadReplies = [
  {
    id: "thread-reply",
    author: mira,
    timestamp: Date.now() - 5400000,
    parsed: {
      name: "Mira",
      body:
        "Use a thread when the replies are the point; use a feed for discovery.",
    },
  },
];
let widgetPosts = [...feedPosts, threadRoot, ...threadReplies];

const widget = document.querySelector("#widget");
widget.posts = widgetPosts;
widget.onPublish = async ({ body, file, replyTo }) => {
  if (!body.trim() && !file) throw Error("Write something or choose media.");
  const post = {
    id: String(Date.now()),
    author: ev,
    timestamp: Date.now(),
    parsed: {
      name: "Demo visitor",
      body: body || "Media selected — connect an AndFS uploader in your host.",
      ...(replyTo ? { reply: replyTo.id, replyto: replyTo.author } : {}),
    },
  };
  widgetPosts = [post, ...widgetPosts];
  widget.posts = widgetPosts;
};
