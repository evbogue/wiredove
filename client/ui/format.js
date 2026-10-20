// Rendering primitives shared by Wiredove and its embeddable elements.
// `visual` is APDS's Visualize Buffer encoder (Dominic Tarr, MIT), copied
// exactly so an author key always produces the same avatar in both contexts.
export const human = (timestamp) => {
  let seconds = Math.round((Date.now() - new Date(Number(timestamp))) / 1000);
  seconds = Math.abs(seconds);
  const times = [
    seconds / 60 / 60 / 24 / 365,
    seconds / 60 / 60 / 24 / 30,
    seconds / 60 / 60 / 24 / 7,
    seconds / 60 / 60 / 24,
    seconds / 60 / 60,
    seconds / 60,
    seconds,
  ];
  const names = ["y", "mo", "w", "d", "h", "m", "s"];
  for (let index = 0; index < names.length; index++) {
    const time = Math.floor(times[index]);
    if (time >= 1) return time + names[index];
  }
  return "now";
};

export const visual = (pubkey, width = 256) => {
  const binary = atob(pubkey);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  const canvas = document.createElement("canvas");
  canvas.height = width;
  canvas.width = width;
  const context = canvas.getContext("2d");
  const blocks = Math.ceil(Math.sqrt(bytes.length * 2));
  const size = Math.ceil(width / blocks);
  const rect = (index, color) => {
    const x = index % blocks;
    const y = Math.floor(index / blocks);
    context.fillStyle = color < 12
      ? `hsl(${(color / 12) * 360},100%,50%)`
      : `hsl(0,0%,${Math.floor(((color - 12) / 3) * 100)}%)`;
    context.fillRect(x * size, y * size, size, size);
  };
  for (let index = 0; index < bytes.length; index++) {
    rect(2 * index, (bytes[index] >> 4) & 15);
    rect(2 * index + 1, bytes[index] & 15);
  }
  const image = document.createElement("img");
  image.src = canvas.toDataURL();
  return image;
};

export const displayName = (parsed, author) =>
  parsed?.name || String(author || "").substring(0, 10);

