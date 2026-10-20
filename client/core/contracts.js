/**
 * Shared service contracts. These declarations define the migration boundary;
 * they do not assert that every existing adapter implements it yet.
 *
 * @typedef {Object} VerifiedPost
 * @property {string} id Hash of signature bytes, never YAML or a media manifest.
 * @property {string} signature Exact ANProto envelope.
 * @property {string} content Exact signed content bytes as text, never reserialized.
 * @property {string} author Author public key authenticated by the signature.
 * @property {number} timestamp Authenticated timestamp in milliseconds.
 * @property {string} contentHash Authenticated SHA-256 content hash.
 * @property {Object} parsed Parsed signed content; derived UI state lives elsewhere.
 *
 * @typedef {Object} PostView
 * @property {VerifiedPost} post
 * @property {Object} presentation Derived profile/edit/moderation data.
 * @property {number} [replyCount]
 * @property {boolean} [repliesComplete] False for bounded author-history adapters.
 *
 * @typedef {Object} RequestOptions
 * @property {AbortSignal} [signal] Cancel or suppress stale results.
 * @property {number} [limit]
 * @property {unknown} [cursor] Adapter-owned cursor, not a shared timestamp assumption.
 *
 * @typedef {Object} Page
 * @property {VerifiedPost[]} posts
 * @property {unknown} [nextCursor]
 * @property {boolean} complete Completeness only within the requested adapter scope.
 * @property {string} scope For example author-history, local-index, or thread.
 *
 * @typedef {Object} Capabilities
 * @property {boolean} compose
 * @property {boolean} reply
 * @property {boolean} attachMedia
 * @property {boolean} edit
 * @property {boolean} moderate
 * @property {boolean} inspectRaw
 * @property {boolean} share
 * @property {boolean} discoverReplies
 * @property {boolean} search
 *
 * @typedef {Object} Draft
 * @property {string} body
 * @property {File|null} [file]
 * @property {{postId: string, author: string}|null} [replyTo]
 * @property {string|null} [editTarget]
 *
 * @typedef {Object} FeedService
 * @property {function(Object, RequestOptions): Promise<Page>} loadFeed
 * @property {function(string, RequestOptions): Promise<VerifiedPost|null>} getPost
 * @property {function(string, RequestOptions): Promise<Page>} getReplies
 * @property {function(string, RequestOptions): Promise<Object>} loadProfile
 * @property {function(string, RequestOptions): Promise<Page>} search
 * @property {function(Object, function(Object): void): function(): void} subscribe
 *   Returns cleanup. Updates carry normalized records and do not mutate signed data.
 *
 * @typedef {Object} PublishService
 * @property {function(Draft, RequestOptions): Promise<Object>} publish
 *   Result includes verified post and explicit local/delivery/confirmation status.
 *   Service owns signing, storage, media durability and transport confirmation.
 *
 * Unsupported operations reject with an explicit unsupported status; they do not
 * return an empty successful page. Frame capabilities AND real handlers gate UI.
 * Navigation intents use {type, id?, author?, query?}. Reply intents use
 * {postId, author}; moderation uses {action, postId?, author?}. Existing public
 * callbacks/events retain their old shapes until documented compatibility bridges
 * translate them. One action must not publish twice through callback and event.
 */
export {};
