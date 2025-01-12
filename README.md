# Wiredove 

A work-in-progress experimental distributed social networking application built on at the [Bog5 Protocol](https://github.com/evbogue/bog5) for message authentication and [Trystero](https://github.com/dmotz/trystero) for multiplayer serverless collaboration.

Try it: https://wiredove.net/

The entire application stack runs in a browser window, so there is no installation required. You can clone the repo down and deploy it anywhere. But because all of the data is local-first you will have the same experience if you use the official Wiredove deployment or do it yourself. 

### Bog5 protocol messages

Bog5 is the latest iteration of the Bogbook protocol, but the 5th version aims to be as simple and extensible as possible by simply signing timestamped hashes. These hashes retrieve Yaml documents that contain an author's name, image hash, and the author's previous post. 

In this version we've opted to include the avatar name in every post due to previous attempts at impersonation attacks. You can now easily see an author's name and image and how they change over the history of their posts so if someone starts off as 'anonymous commenter' and then switches their name to 'ev' you can see this occur in the feed history. It is also easy to confirm the public key of the post and authenticate whether the messages arrived from approved public keys.

The previous message hash is included in each message to make it easy to sync a feed from the latest post until the oldest post. When Wiredove connects over Trystero to other peers it will send a list of public keys that the application wants to sync. Other peers reply by sending the latest message that they have from every author. If the message is newer then network participants will replicate that message and sync each previous message until the feed history has caught up.

### Trystero serveless multiplayer

Trystero uses legacy Internet infrastructure to bootstrap WebRTC connections. In this case we're using the Bittorrent DHT to negotiate connections. Wiredove will create Trystero rooms for each author that we have knowledge of. Only using public keys to connect makes it possible for multiple network graphs to exist without necessarily overlapping.

We might create a main room to announce new public keys as they join the network.

### URL embeds

Bog5 messages are as short as they can be, so it can be possible to relay messages using URL embeds. Open opening the below link, Wiredove will open a Trystero room for the author of the message and attempt to sync the message if any peer is available in that room. 

https://wiredove.net/#eV1TUbuPIw+0F1ynylaktIIKukdYEaXcZOyEF6pIUaw=XJss1AlAZ9xWeNTP2fKlSHIKMERRIAOhhMLGQqLzx94eC0MnnlXZQ4C4dG905nws1YEO5B006lXVeYVAyGkoCTE3MzY3MTM3OTY1MjJibUI3TitBU2EzTElML0t1UFhqR2dvZXovdEY5dHhWQzIxVktaSC9ZajVjPQ==

Questions? ev@evbogue.com

---
MIT
