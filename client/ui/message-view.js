import { createMessageMain } from './message-layout.js';
import { resolveImageSource, safeLinkURL, safeImageURL } from './image-source.js';
import { displayName, human, visual } from './format.js';
import { appendFormattedText } from './body.js';
import { renderAndFSMedia, disposeMedia } from './media-render.js';

// The canonical message component for both the APDS website and public widgets.
// Explicit node extensions preserve website IDs, observers and control state in
// light DOM. The public custom element mounts this same component in shadow DOM.
// Hosts own identity, message verification and persistence; media readers verify bytes.
function createMessageShell({
  metadata, avatarLink, authorNode, content, replyContext, raw,
  actions, trailing, document: doc = globalThis.document,
} = {}) {
  const article = doc.createElement('article');
  article.className = 'message';
  article.dataset.wiredoveMessage = '';
  const body = doc.createElement('div');
  body.className = 'message-body';
  for (const node of [replyContext, content, raw, actions]) if (node) body.append(node);
  if (metadata) article.append(metadata);
  article.append(createMessageMain({ avatarLink, authorNode, bodyNode: body, document: doc }));
  if (trailing) article.append(trailing);
  return { article, body, content, actions };
}

// A missing parent remains addressable; hydration may supply an authenticated
// preview later. Do not manufacture parent text or claim thread completeness.
export function createReplyContext(id, {
  href = '#' + id, onNavigate, document: doc = globalThis.document,
} = {}) {
  if (!id) return null;
  const preview = doc.createElement('span');
  preview.className = 'reply-preview';
  preview.dataset.replyPreview = id;
  const icon = doc.createElement('span');
  icon.className = 'reply-preview-icon';
  icon.textContent = '↳';
  icon.setAttribute('aria-hidden', 'true');
  const link = doc.createElement('a');
  link.href = href;
  link.className = 'reply-preview-link';
  link.textContent = id.substring(0, 10) + '...';
  link.setAttribute('aria-label', 'Open parent post');
  link.addEventListener('click', event => {
    if (!onNavigate || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate({ type: 'post', id });
  });
  preview.append(icon, link);
  return preview;
}

const ordinaryClick = event => !event.defaultPrevented && event.button === 0 &&
  !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

// Host permalinks may be same-origin root-relative URLs. Resolve first so
// protocol-relative or backslash-normalized external URLs cannot slip through.
const safePresentationURL = (value, doc) => {
  const safe = safeLinkURL(value);
  if (safe) return safe;
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  try {
    const url = new URL(value, doc.baseURI);
    return url.origin === new URL(doc.baseURI).origin && ['http:', 'https:'].includes(url.protocol) ? value : null;
  } catch { return null; }
};


// Record-driven component shared by both frames. Website extensions are the
// compatibility bridge for its existing observer-bound nodes and rich controls;
// they never replace the component's author/body/action layout.
export function createMessageView({
  post, presentation = {}, handlers = {}, extensions = {}, document: doc = globalThis.document,
} = {}) {
  const parsed = post.parsed || post;
  let disposed = false, legacyCleanup;
  const presentationURL = value => safePresentationURL(value, doc);
  const navigate = (event, route) => {
    if (typeof handlers.onNavigate !== 'function' || !ordinaryClick(event)) return;
    event.preventDefault(); handlers.onNavigate(route);
  };
  const authorURL = presentationURL(presentation.authorURL?.(post)) ||
    `https://wiredove.net/#${encodeURIComponent(post.author || '')}`;
  let avatarLink = extensions.avatarLink;
  if (!avatarLink) {
    let avatar;
    try { avatar = visual(post.author); }
    catch { avatar = doc.createElement('img'); }
    avatar.className = 'avatar'; avatar.alt = '';
    const customAvatar = safeImageURL(presentation.avatarURL?.(post), { resolved: true });
    if (customAvatar) avatar.src = customAvatar;
    else if (parsed.image && !extensions.avatarLink) {
      void resolveImageSource({ src: parsed.image }, presentation.resolveImage).then(source => {
        if (source && !disposed && avatar.isConnected) avatar.src = source;
      }).catch(() => {});
    }
    avatarLink = doc.createElement('a');
    avatarLink.href = authorURL;
    avatarLink.setAttribute('aria-label', `View ${displayName(parsed, post.author)}'s profile`);
    avatarLink.addEventListener('click', event => navigate(event, { type: 'profile', author: post.author }));
    avatarLink.append(avatar);
  }
  let author = extensions.authorNode;
  if (!author) {
    author = doc.createElement('a');
    author.className = 'avatarlink';
    author.textContent = displayName(parsed, post.author);
    author.href = authorURL;
    author.addEventListener('click', event => navigate(event, { type: 'profile', author: post.author }));
  }
  let meta = extensions.metadata;
  if (!meta) {
    meta = doc.createElement('span');
    meta.className = 'message-meta';
    const pubkey = doc.createElement('span');
    pubkey.className = 'pubkey';
    pubkey.textContent = String(post.author || '').substring(0, 6);
    const timeLink = doc.createElement('a');
    timeLink.href = presentationURL(presentation.postURL?.(post)) ||
      `https://wiredove.net/#${encodeURIComponent(post.id || '')}`;
    const time = doc.createElement('time');
    const date = new Date(post.timestamp);
    if (post.timestamp != null && Number.isFinite(date.getTime())) {
      time.dateTime = date.toISOString();
      time.title = date.toLocaleString();
      time.textContent = presentation.timestamp?.(post) || human(post.timestamp);
    } else time.textContent = 'Unknown time';
    timeLink.append(time);
    timeLink.addEventListener('click', event => navigate(event, { type: 'post', id: post.id }));
    meta.append(pubkey, ' ', timeLink);
  }
  const content = extensions.content || doc.createElement('div');
  if (!extensions.content) {
    content.className = 'content';
    if (presentation.renderBody) presentation.renderBody(parsed.body, content, post);
    else appendFormattedText(content, parsed.body, { resolveImage: presentation.resolveImage, onOpen: presentation.onOpenGallery });
    renderAndFSMedia(parsed, content, { resolveImage: presentation.resolveImage, onOpen: presentation.onOpenGallery });
    if (parsed.blob && ['audio', 'video'].includes(parsed.type) && !parsed.andfs) {
      if (typeof presentation.renderLegacyMedia === 'function') {
        const cleanup = presentation.renderLegacyMedia(parsed, content, post);
        if (typeof cleanup === 'function') legacyCleanup = cleanup;
      } else {
        const unavailable = doc.createElement('p');
        unavailable.className = 'media-status';
        unavailable.textContent = 'Historical attachment unavailable in this view.';
        content.append(unavailable);
      }
    }
    if (parsed.edit) {
      const note = doc.createElement('p');
      note.className = 'edit-hint';
      note.textContent = 'Edit event; the original post is unchanged.';
      content.prepend(note);
    } else if (!parsed.body && !parsed.andfs && !parsed.blob) {
      const note = doc.createElement('p');
      note.className = 'message-status';
      note.textContent = parsed.bio != null ? `New bio: ${parsed.bio}` : 'Message content unavailable in this view.';
      content.append(note);
    }
  }
  const parentId = parsed.reply || parsed.replyHash || parsed.edit;
  const replyContext = createReplyContext(parentId, {
    href: presentationURL(presentation.replyURL?.(parentId, post)) ||
      `https://wiredove.net/#${encodeURIComponent(parentId || '')}`,
    // Read the current callback, but preserve ordinary browser navigation if absent.
  });
  replyContext?.querySelector('a').addEventListener('click', event =>
    navigate(event, { type: 'post', id: parentId }));
  const actions = doc.createElement('div');
  actions.className = 'message-actions';

  const view = createMessageShell({
    metadata: meta,
    avatarLink,
    authorNode: author,
    content,
    replyContext: extensions.replyContext || replyContext,
    raw: extensions.raw,
    actions: extensions.actions || actions,
    trailing: extensions.trailing,
    document: doc,
  });
  let reply;
  view.updateActions = () => {
    if (extensions.actions) return; // Website adapter owns its richer action set.
    if (typeof handlers.onReply !== 'function') { reply?.remove(); reply = null; return; }
    if (reply) return;
    reply = doc.createElement('button');
    reply.className = 'reply-action'; reply.type = 'button';
    reply.setAttribute('aria-label', 'Reply to this post'); reply.textContent = 'Reply';
    reply.addEventListener('click', () => handlers.onReply?.(handlers.post || post));
    actions.append(reply);
  };
  view.dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeMedia(view.article);
    legacyCleanup?.();
  };
  view.updateActions();
  return view;
}
