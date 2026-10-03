export const appendFormattedText = (target, text) => {
  for (const line of String(text || "").split("\n")) {
    const row = document.createElement("div");
    const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>]+|#[A-Za-z0-9_]+)/g;
    let cursor = 0;
    for (const match of line.matchAll(pattern)) {
      const [whole, imageAlt, imageSource, linkLabel, linkTarget, token] = match;
      row.append(document.createTextNode(line.slice(cursor, match.index)));
      if (imageAlt !== undefined) {
        if (/^https?:\/\//.test(imageSource)) {
          const image = document.createElement("img");
          image.src = imageSource;
          image.alt = imageAlt || "Attached image";
          image.loading = "lazy";
          image.className = "wiredove-inline-image";
          row.append(image);
        } else {
          const label = document.createElement("span");
          label.className = "wiredove-legacy-image-label";
          label.textContent = "Image: " + (imageAlt || "Attached image");
          label.title = "This legacy image is not available here.";
          row.append(label);
        }
      } else if (linkLabel !== undefined) {
        const link = document.createElement("a");
        link.href = linkTarget;
        link.rel = "noreferrer";
        link.textContent = linkLabel || linkTarget;
        row.append(link);
      } else if (/^https?:\/\//.test(token)) {
        const link = document.createElement("a");
        link.href = token;
        link.rel = "noreferrer";
        link.textContent = token;
        row.append(link);
      } else {
        const tag = document.createElement("a");
        tag.href = "#?" + encodeURIComponent(token);
        tag.textContent = token;
        row.append(tag);
      }
      cursor = match.index + whole.length;
    }
    row.append(document.createTextNode(line.slice(cursor)));
    target.append(row);
  }
};

