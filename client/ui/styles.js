const css = `
:host { display:block; color:inherit; font:inherit; }
.controls { align-items:center; display:flex; flex-wrap:wrap; gap:.5rem; }
.status { color:var(--wiredove-muted, #777); font-size:.875rem; min-height:1.2em; }
.message-actions { margin-top:.25rem; }
.reply-action { border:0; background:transparent; color:var(--wiredove-muted, #777); cursor:pointer; font:inherit; padding:0; }
.reply-action:hover { color:inherit; text-decoration:underline; }
.message-body .wiredove-inline-image { display:block; max-width:100%; max-height:36rem; height:auto; object-fit:contain; margin-block:.5rem; }
.message-body .wiredove-legacy-image-label { display:block; color:var(--wiredove-muted, #777); font-size:.88rem; }
`;
const wiredoveStyleURL = new URL("../../style.css", import.meta.url).href;
export const applyWiredoveStyles = (root) => {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = wiredoveStyleURL;
  const local = document.createElement("style");
  local.textContent = css;
  root.append(stylesheet, local);
};

