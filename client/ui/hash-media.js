import { readAndFSMedia } from '../andfs.js';

// Detect presentation from verified bytes, never from a hash's spelling or a URL suffix.
export function mediaMime(bytes) {
  const at = (offset, text) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  if (at(0, '\x89PNG\r\n\x1a\n')) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'image/gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'audio/wav';
  // Container signatures alone do not distinguish audio from video. Inspect
  // codec/handler identifiers; use a video player for ambiguous containers,
  // since it can play audio-only files too.
  const header = () => new TextDecoder('latin1').decode(bytes.slice(0, 1024 * 1024));
  if (at(0, 'OggS')) {
    const text = header();
    return !text.includes('theora') && (text.includes('OpusHead') || text.includes('vorbis')) ? 'audio/ogg' : 'video/ogg';
  }
  if (at(0, '\x1a\x45\xdf\xa3')) {
    const text = header();
    return !text.includes('V_') && (text.includes('A_OPUS') || text.includes('A_VORBIS')) ? 'audio/webm' : 'video/webm';
  }
  if (at(4, 'ftyp')) {
    const text = header();
    return at(8, 'M4A ') || at(8, 'M4B ') || (text.includes('soun') && !text.includes('vide')) ? 'audio/mp4' : 'video/mp4';
  }
  if (at(0, 'ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'audio/mpeg';
  return 'application/octet-stream';
}

export async function createHashMediaView(hash, { source, signal, document: doc = globalThis.document, ...options } = {}) {
  const bytes = await readAndFSMedia({ andfs: hash, media_source: source }, { ...options, signal });
  const mime = mediaMime(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const view = doc.createElement('section');
  view.className = 'hash-media-view';
  const type = mime.split('/')[0];
  let player;
  if (['image', 'audio', 'video'].includes(type)) {
    player = doc.createElement(type === 'image' ? 'img' : type);
    player.className = 'media-player'; player.src = url;
    if (type === 'image') player.alt = 'Image';
    else { player.controls = true; player.playsInline = true; }
    view.append(player);
  }
  const download = doc.createElement('a');
  download.href = url; download.download = hash; download.textContent = 'Download file';
  view.append(download);
  return { view, dispose() { player?.removeAttribute('src'); URL.revokeObjectURL(url); } };
}
