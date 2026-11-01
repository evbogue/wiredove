import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMime } from '../client/ui/hash-media.js';
import { andfsImageMetadata, attachmentDisplayBody } from '../client/andfs.js';
const bytes = text => Uint8Array.from(text, char => char.charCodeAt(0));
test('file routes detect verified byte signatures, including audio containers', () => {
  for (const [signature, mime] of [
    ['\x89PNG\r\n\x1a\n', 'image/png'], ['\xff\xd8\xff', 'image/jpeg'],
    ['GIF89a', 'image/gif'], ['RIFFxxxxWEBP', 'image/webp'],
    ['RIFFxxxxWAVE', 'audio/wav'], ['ID3', 'audio/mpeg'],
    ['OggS', 'video/ogg'], ['\x1a\x45\xdf\xa3', 'video/webm'],
    ['xxxxftyp', 'video/mp4'], ['arbitrary bytes', 'application/octet-stream'],
    ['', 'application/octet-stream']]) assert.equal(mediaMime(bytes(signature)), mime);
});
test('inline and profile image references accept hash links and historical gateways', () => {
  const hash = 'A'.repeat(43);
  for (const url of [`https://example.test/timeline/#${hash}`, `https://example.test/timeline/media/${hash}`]) {
    const meta = andfsImageMetadata(url);
    assert.equal(meta.andfs, hash);
    assert.equal(meta.media_source, 'https://example.test/timeline');
  }
  assert.equal(andfsImageMetadata('https://user:pass@example.test/#' + hash), null);
  assert.equal(andfsImageMetadata('https://example.test/#settings'), null);
});

test('only the generated trailing media fallback link is hidden from display', () => {
  const meta = {andfs:'A'.repeat(43),type:'audio',media_url:'https://example.test/#hash'};
  assert.equal(attachmentDisplayBody({...meta,body:'A song\n\n'+meta.media_url}), 'A song');
  assert.equal(attachmentDisplayBody({...meta,body:meta.media_url}), '');
  for (const body of ['Listen at '+meta.media_url, '`'+meta.media_url+'`', meta.media_url+' with commentary'])
    assert.equal(attachmentDisplayBody({...meta,body}), body);
  assert.equal(attachmentDisplayBody({...meta,type:'image',body:meta.media_url}), meta.media_url);
});
