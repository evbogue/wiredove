// Canonical message layout primitive shared by the website and embeddable widgets.
// Hosts own identity, verification, actions and their outer article/wrapper.
// This module has no app boot, storage or transport dependencies.
export function createMessageMain({ avatarLink, authorNode, bodyNode, document: doc = globalThis.document } = {}) {
  if (!doc) throw new Error('A document is required to render a message');
  const main = doc.createElement('div');
  main.className = 'message-main';
  const stack = doc.createElement('div');
  stack.className = 'message-stack';
  if (authorNode) stack.append(authorNode);
  if (bodyNode) stack.append(bodyNode);
  if (avatarLink) main.append(avatarLink);
  main.append(stack);
  return main;
}
