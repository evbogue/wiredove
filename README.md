# Wiredove 

![Wiredove Logo](dove_sm.png)

A work-in-progress experimental distributed social networking application built on [ANProto](https://anproto.com/)'s for message authentication, [apds](https://apds.anproto.com/) for message distribution, and [Trystero](https://github.com/dmotz/trystero) for multiplayer serverless collaboration.

Try it at: https://wiredove.net/

For new message notifications subscribe via https://ntfy.sh/wiredove since Wiredove doesn't have in-app notifications yet.

The entire application stack runs in a browser window, so there is no installation required. You can clone the repo down and deploy it anywhere. But because all of the data is local-first you will have the same experience if you use the official Wiredove deployment or do it yourself. 

### Running with Docker

Build the image from the project root:

```bash
docker build -t wiredove .
```

Or use Docker Compose:

```bash
docker compose up --build
```

Run the container and expose it on port 8000:

```bash
docker run --rm -p 8000:8000 wiredove
```

Then open `http://localhost:8000` in your browser.

### Comparisons

WIP

Compare to Bluesky's ATProto

Compare to Nostr

Compare to Secure-Scuttlebot

### ANProto directory

ANProto protocol messages are long enough to not be memorable, to bust thru Zooko's triangle]] we can deploy centralized directory services that map usernames to arrays of keypairs. 

Here's an example JSON server: https://pub.wiredove.net/ev

Try it out in your browser: https://wiredove.net/#ev

The code for this is at https://github.com/evbogue/dovepub

### ANProto messages

[](https://anproto.com/)  is the latest iteration of the Bogbook protocol, but the 5.1th version aims to be as simple and extensible as possible by simply signing timestamped hashes. These hashes retrieve Yaml documents that contain an author's name, image hash, and the author's previous post. A bonus is that ANProto is no longer called Bogbook, which was a hilarious name but not the best look on marketing materials. 

In this version we've opted to include the avatar name in every post due to previous attempts at impersonation attacks. You can now easily see an author's name and image and how they change over the history of their posts so if someone starts off as 'anonymous commenter' and then switches their name to 'ev' you can see this occur in the feed history. It is also easy to confirm the public key of the post and authenticate whether the messages arrived from approved public keys.

The previous message hash is included in each message to make it easy to sync a feed from the latest post until the oldest post. When Wiredove connects over Trystero to other peers it will send a list of public keys that the application wants to sync. Other peers reply by sending the latest message that they have from every author. If the message is newer then network participants will replicate that message and sync each previous message until the feed history has caught up.

### Trystero serveless multiplayer

Trystero uses legacy Internet infrastructure to bootstrap WebRTC connections. In this case we're using the Bittorrent DHT to negotiate connections. Wiredove will create Trystero rooms for each author that we have knowledge of. Only using public keys to connect makes it possible for multiple network graphs to exist without necessarily overlapping.

Since there are not many active peers at the moment I've set up an ntfy channel to broadcast new messages. https://ntfy.sh/wiredove -- subscribe using the ntfy app to get push notifications when there are new messages.

### URL embeds

ANProto messages are as short as they can be, so it can be possible to relay messages using URL embeds. Open opening the below link, Wiredove will open a Trystero room for the author of the message and attempt to sync the message if any peer is available in that room. 

https://wiredove.net/#evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k=+MmR4IUxD/w26xkn4VoIkNr3zPXQ+mV6DED3+FuglngiX5f6gube5chIDsSGN6vZQWptg4i0BiScx9NQzINnBjE3NDgyODA1MDY0NTd3TTQvbHJWRGZFcDc2dDhNRjhwVzAwb0tWeGZDY21DdzNJMmVHWEVUaDZZPQ==

Questions? ev@evbogue.com

---
MIT
