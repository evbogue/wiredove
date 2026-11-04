import { appendFormattedText } from './body.js';
import { createImageGallery } from './image-gallery.js';
import { normalizeProfileLinks } from '../profile-links.js';

// Profile metadata is also inherited by ordinary posts. Only an otherwise
// empty statement is presented as a profile update; signed bytes stay intact.
export function isProfileUpdate(post) {
  return !!post && !String(post.body || '').trim() &&
    !post.edit && !post.reply && !post.replyHash && !post.replyto && !post.replyTo &&
    !post.andfs && !post.blob && !post.type &&
    (['name', 'image', 'bio', 'background'].some(key => typeof post[key] === 'string') ||
      Array.isArray(post.links));
}

export function renderProfileUpdate(post, target, options = {}) {
  if (!isProfileUpdate(post)) return false;
  const doc = target.ownerDocument;
  const card = doc.createElement('section');
  card.className = 'profile-update';
  card.setAttribute('aria-label', 'Profile update');
  const text = (tag, value) => {
    const node = doc.createElement(tag); node.textContent = value; card.append(node);
    return node;
  };
  text('strong', 'Updated profile');
  if (typeof post.name === 'string' && post.name.trim()) text('p', 'Display name: ' + post.name.trim());
  if (typeof post.image === 'string') {
    if (post.image.trim()) card.append(createImageGallery({
      ...options, document: doc, images: [{ src: post.image, alt: 'Profile photo' }],
    }));
    else text('p', 'Profile photo removed');
  }
  if (typeof post.bio === 'string') {
    if (post.bio.trim()) {
      text('strong', 'New bio:');
      const bio = doc.createElement('div');
      appendFormattedText(bio, post.bio, options); card.append(bio);
    } else text('p', 'Bio cleared');
  }
  if (Array.isArray(post.links)) {
    const links = normalizeProfileLinks(post.links);
    text('p', post.links.length ? 'Profile links updated' : 'Profile links cleared');
    for (const link of links) {
      const row = doc.createElement('p'), anchor = doc.createElement('a');
      anchor.textContent = link.label; anchor.href = link.url;
      anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      row.append(anchor); card.append(row);
    }
  }
  if (typeof post.background === 'string') text('p', post.background.trim() ? 'Profile background updated' : 'Profile background removed');
  target.replaceChildren(card);
  return true;
}
