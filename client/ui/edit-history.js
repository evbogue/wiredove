// Edit history for the shared message UI, mirroring the website's
// render.js behavior: same-author edits only, oldest first, latest shown by
// default. A post keeps the name/photo it was posted with; an edit updates
// only the body (and its version history), never the original header or media.

export function collectEdits(posts) {
  const byId = new Map();
  for (const post of posts || []) if (post?.id) byId.set(post.id, post);
  const editsByTarget = new Map();
  for (const post of posts || []) {
    const targetId = post?.parsed?.edit;
    if (!targetId) continue;
    const target = byId.get(targetId);
    if (!target || target.author !== post.author) continue;
    const list = editsByTarget.get(targetId) || [];
    list.push(post);
    editsByTarget.set(targetId, list);
  }
  for (const list of editsByTarget.values()) {
    list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }
  return editsByTarget;
}

// A name/image/bio statement with no post body or media: a profile update,
// not an ordinary post.
export function isProfileStatement(post) {
  const parsed = post?.parsed || {};
  return !parsed.body && !parsed.andfs && !parsed.blob && !parsed.edit &&
    (parsed.name != null || parsed.image != null || parsed.bio != null);
}

// Versions for one post: index 0 is the original, then its edits in order.
// An edit without a body falls back to the original body, like render.js.
export function editVersions(post) {
  const base = { body: post.parsed?.body ?? '', timestamp: post.timestamp, id: post.id };
  const versions = [base];
  for (const edit of post?.edits || []) {
    versions.push({
      body: Object.hasOwn(edit.parsed || {}, 'body') ? edit.parsed.body : base.body,
      timestamp: edit.timestamp,
      id: edit.id,
    });
  }
  return versions;
}

// Returns ordinary posts with their edits attached as post.edits (a shallow
// copy, so host records are never mutated). Edit records themselves never
// appear as standalone rows.
export function attachEditHistory(posts) {
  const editsByTarget = collectEdits(posts);
  const ordinary = [];
  for (const post of posts || []) {
    if (post?.parsed?.edit) continue;
    const edits = editsByTarget.get(post.id);
    ordinary.push(edits?.length ? { ...post, edits } : post);
  }
  return ordinary;
}
