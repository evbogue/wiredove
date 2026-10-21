import { marked } from '../../vendor/marked/marked.esm.js';
import { createImageGallery } from './image-gallery.js';
import { safeLinkURL } from './image-source.js';

const wrappers = { strong: 'strong', em: 'em', del: 'del', link: 'a' };
function inlineUnits(tokens, parents = []) {
  return tokens.flatMap(token => {
    if (token.type === 'image') return [{ image: { src: token.href, alt: token.text, title: token.title,
      link: parents.find(parent => parent.tag === 'a')?.href } }];
    if (wrappers[token.type]) return inlineUnits(token.tokens || [], [...parents,
      { tag: wrappers[token.type], href: token.href, title: token.title }]);
    if (token.tokens) return inlineUnits(token.tokens, parents);
    return [{ text: token.text ?? token.raw ?? '', code: token.type === 'codespan',
      br: token.type === 'br', literal: token.type === 'html', parents }];
  });
}

function inlineBlocks(tokens, tag = 'p') {
  const blocks = [];
  let prose = [];
  const flush = () => {
    if (prose.some(unit => unit.code || unit.br || unit.text.trim())) blocks.push({ tag, units: prose });
    prose = [];
  };
  for (const unit of inlineUnits(tokens)) {
    if (unit.image) {
      flush();
      if (blocks.at(-1)?.images) blocks.at(-1).images.push(unit.image);
      else blocks.push({ images: [unit.image] });
    } else prose.push(unit);
  }
  flush();
  return blocks;
}

function blocksFromTokens(tokens) {
  const blocks = [];
  const append = block => {
    if (block.images && blocks.at(-1)?.images) blocks.at(-1).images.push(...block.images);
    else blocks.push(block);
  };
  for (const token of tokens) {
    switch (token.type) {
      case 'space': break;
      case 'paragraph': case 'text':
        inlineBlocks(token.tokens || [{ type: 'text', text: token.text }]).forEach(append); break;
      case 'heading':
        // Headings are boundaries even if an image is their only content.
        blocks.push({ tag: 'div', children: inlineBlocks(token.tokens, 'h' + token.depth) }); break;
      case 'blockquote': blocks.push({ tag: 'blockquote', children: blocksFromTokens(token.tokens) }); break;
      case 'list': blocks.push({ tag: token.ordered ? 'ol' : 'ul', start: token.start,
        children: token.items.map(item => ({ tag: 'li', task: item.task, checked: item.checked,
          children: blocksFromTokens(item.tokens) })) }); break;
      case 'code': blocks.push({ tag: 'pre', code: token.text, lang: token.lang }); break;
      case 'hr': blocks.push({ tag: 'hr' }); break;
      case 'table': blocks.push({ tag: 'table', children: [
        { tag: 'thead', children: [{ tag: 'tr', children: token.header.map((cell, index) => ({ tag: 'th', align: token.align[index], children: inlineBlocks(cell.tokens, 'div') })) }] },
        { tag: 'tbody', children: token.rows.map(row => ({ tag: 'tr', children: row.map((cell, index) => ({ tag: 'td', align: token.align[index], children: inlineBlocks(cell.tokens, 'div') })) })) },
      ] }); break;
      default: blocks.push({ tag: 'p', units: [{ text: token.raw || token.text || '', literal: true, parents: [] }] });
    }
  }
  return blocks;
}

// The ordered model is DOM-free, testable, and never changes the signed body.
export const parseMessageBody = text => blocksFromTokens(marked.lexer(String(text || ''), { gfm: true }));

function decodeEntities(doc, text) {
  const area = doc.createElement('textarea');
  area.innerHTML = text; // Detached RCDATA element decodes entities without interpreting markup.
  return area.value;
}
function renderUnits(target, units, doc) {
  for (const unit of units) {
    let parent = target;
    for (const wrap of unit.parents || []) {
      const href = wrap.tag === 'a' ? safeLinkURL(decodeEntities(doc, wrap.href || '')) : null;
      if (wrap.tag === 'a' && !href) continue;
      const node = doc.createElement(wrap.tag);
      if (href) { node.href = href; node.rel = 'noreferrer'; }
      if (wrap.title) node.title = decodeEntities(doc, wrap.title);
      parent.append(node); parent = node;
    }
    if (unit.br) { parent.append(doc.createElement('br')); continue; }
    if (unit.code) { const code = doc.createElement('code'); code.textContent = decodeEntities(doc, unit.text); parent.append(code); continue; }
    const text = unit.literal ? unit.text : decodeEntities(doc, unit.text);
    if (unit.literal || unit.parents?.some(wrap => wrap.tag === 'a')) { parent.append(doc.createTextNode(text)); continue; }
    let cursor = 0;
    for (const match of text.matchAll(/(^|\s)(#[\p{L}\p{N}_-]+)/gu)) {
      const start = match.index + match[1].length;
      parent.append(doc.createTextNode(text.slice(cursor, start)));
      const link = doc.createElement('a'); link.href = '#?' + match[2]; link.textContent = match[2];
      parent.append(link); cursor = start + match[2].length;
    }
    parent.append(doc.createTextNode(text.slice(cursor)));
  }
}
function renderBlocks(target, blocks, options, doc) {
  for (const block of blocks) {
    if (block.images) {
      target.append(createImageGallery({ ...options, document: doc, images: block.images.map(image => ({ ...image,
        src: decodeEntities(doc, image.src || ''), alt: decodeEntities(doc, image.alt || ''),
        title: decodeEntities(doc, image.title || ''), link: decodeEntities(doc, image.link || '') })) }));
      continue;
    }
    const node = doc.createElement(block.tag);
    if (block.start) node.start = Number(block.start);
    if (block.align) node.style.textAlign = block.align;
    if (block.task) { const input = doc.createElement('input'); input.type = 'checkbox'; input.disabled = true; input.checked = Boolean(block.checked); node.append(input); }
    if (block.code !== undefined) {
      const code = doc.createElement('code'); code.textContent = block.code;
      if (block.lang) code.className = 'language-' + block.lang.split(/\s/)[0];
      node.append(code);
    }
    if (block.units) renderUnits(node, block.units, doc);
    if (block.children) renderBlocks(node, block.children, options, doc);
    target.append(node);
  }
}

export function appendFormattedText(target, text, options = {}) {
  renderBlocks(target, parseMessageBody(text), options, target.ownerDocument);
}
