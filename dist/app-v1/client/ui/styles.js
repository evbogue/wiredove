const css = `
:host { display:block; color:inherit; font:inherit; }
.identity-panel { margin:1rem 0; padding:1rem 0; border-block:1px solid var(--wiredove-control-border,#ddd); }
.identity-panel label { display:block; margin:.75rem 0; }
.identity-panel input { max-width:100%; box-sizing:border-box; }
.identity-panel code { overflow-wrap:anywhere; }
.identity-panel button { margin:.5rem .5rem .5rem 0; }
:host([appearance="publication"]) .widget-nav { flex-wrap:wrap; }
:host([appearance="publication"]) { --wiredove-surface:transparent; --wiredove-border:#ddd; --wiredove-control:#fff; --wiredove-text:#202124; --wiredove-muted:#606770; --wiredove-control-border:#d5d8dc; --wiredove-control-hover:#f1f3f5; --wiredove-radius:0; color:#202124; }
:host([appearance="publication"]) .message { border:0; border-bottom:1px solid #ddd; background:transparent; padding:1rem 0; margin:0; }
:host([appearance="publication"]) .message:hover { border:0; border-bottom:1px solid #ddd; }
.controls { align-items:center; display:flex; flex-wrap:wrap; gap:.5rem; }
.status { color:var(--wiredove-muted, #777); font-size:.875rem; min-height:1.2em; }
.message-actions { margin-top:.25rem; }
.reply-action { border:0; background:transparent; color:var(--wiredove-muted, #777); cursor:pointer; font:inherit; padding:0; }
.reply-action:hover { color:inherit; text-decoration:underline; }
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

