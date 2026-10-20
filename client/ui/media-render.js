export const renderAndFSMedia = (yaml, container) => {
  if (!yaml?.andfs || !["image", "audio", "video"].includes(yaml.type)) {
    return false;
  }
  const source = /^https:\/\//.test(yaml.media_url || "") ||
      /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(
        yaml.media_url || "",
      )
    ? yaml.media_url
    : null;
  const wrap = document.createElement("div");
  wrap.className = "media-post";
  if (!source) {
    wrap.textContent = "AndFS media is unavailable: no safe media URL.";
    container.appendChild(wrap);
    return true;
  }
  // ANProto calls this kind "image"; HTML calls the element "img".
  const player = document.createElement(
    yaml.type === "image" ? "img" : yaml.type,
  );
  player.className = "media-player";
  player.src = source;
  if (yaml.type === "image") {
    player.alt = yaml.media_name || "Attached image";
    player.loading = "lazy";
  } else {
    player.controls = true;
    player.preload = yaml.type === "video" ? "metadata" : "none";
    if (yaml.type === "video") player.playsInline = true;
  }
  wrap.appendChild(player);
  const link = document.createElement("a");
  link.href = source;
  link.textContent = yaml.media_name || "Download attachment";
  wrap.appendChild(link);
  container.appendChild(wrap);
  return true;
};

