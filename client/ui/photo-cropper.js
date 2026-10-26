// Cropper.js is loaded only when a user opens the crop dialog.
export async function createPhotoCropper(stage, preview, source, settings, onChange) {
  const { default: Cropper } = await import('../../vendor/cropperjs/cropper.esm.js');
  if (!stage.isConnected) throw new DOMException('Crop cancelled', 'AbortError');
  const cropper = new Cropper(source, { container: stage, template: `
    <cropper-canvas background>
      <cropper-image rotatable scalable translatable initial-fit="cover" min-fit="cover" max-inset="0"></cropper-image>
      <cropper-selection aspect-ratio="1" outlined><cropper-grid covered></cropper-grid><cropper-crosshair centered></cropper-crosshair></cropper-selection>
      <cropper-handle action="move" plain></cropper-handle>
    </cropper-canvas>` });
  const canvas = cropper.getCropperCanvas(), image = cropper.getCropperImage(), selection = cropper.getCropperSelection();
  let native;
  try { native = await image.$ready(); await native.decode(); }
  catch (error) { cropper.destroy(); throw error; }
  // Let the library finish its initial load/centering before restoring saved framing.
  await new Promise(requestAnimationFrame);
  if (!stage.isConnected) { cropper.destroy(); throw new DOMException('Crop cancelled', 'AbortError'); }
  let width = canvas.clientWidth, disposed = false, pending = 0, frameId = null;
  const getSettings = () => {
    const [a,b,c,d] = image.$getTransform();
    const bounds = image.getBoundingClientRect(), frame = canvas.getBoundingClientRect();
    const cx = bounds.left + bounds.width/2 - frame.left, cy = bounds.top + bounds.height/2 - frame.top;
    return { version: 1, source_width: native.naturalWidth, source_height: native.naturalHeight,
      matrix: [a/width,b/width,c/width,d/width,cx/width,cy/width] };
  };
  const restore = data => {
    if (data?.version !== 1 || data.source_width !== native.naturalWidth || data.source_height !== native.naturalHeight ||
        !Array.isArray(data.matrix) || data.matrix.length !== 6 || !data.matrix.every(Number.isFinite)) return false;
    const [a,b,c,d,cx,cy] = data.matrix;
    if (Math.hypot(a,b) <= 0 || Math.hypot(c,d) <= 0 || Math.abs(a*d-b*c) < 1e-15) return false;
    const bounds = image.getBoundingClientRect(), frame = canvas.getBoundingClientRect();
    const old = image.$getTransform();
    image.$setTransform(a*width,b*width,c*width,d*width,old[4]+cx*width-(bounds.left+bounds.width/2-frame.left),old[5]+cy*width-(bounds.top+bounds.height/2-frame.top));
    return true;
  };
  const outputSize = () => {
    const [a,b,c,d] = image.$getTransform();
    return Math.max(1, Math.floor(Math.min(1024, selection.width / Math.hypot(a,b), selection.height / Math.hypot(c,d)) + 1e-6));
  };
  // Keep every square-crop corner inside the rotated source, including after pan.
  const fit = () => {
    let [a,b,c,d,e,f] = image.$getTransform();
    const scale = Math.hypot(a,b), cos = a/scale, sin = b/scale;
    const span = width * (Math.abs(cos)+Math.abs(sin));
    const nextScale = Math.max(scale, span / Math.min(native.naturalWidth,native.naturalHeight));
    const ratio = nextScale/scale;
    const bounds = image.getBoundingClientRect(), frame = canvas.getBoundingClientRect();
    const cx = bounds.left+bounds.width/2-frame.left, cy = bounds.top+bounds.height/2-frame.top;
    const dx = width/2-cx, dy = width/2-cy;
    const u = dx*cos+dy*sin, v = -dx*sin+dy*cos;
    const marginU = Math.max(0,(native.naturalWidth*nextScale-span)/2);
    const marginV = Math.max(0,(native.naturalHeight*nextScale-span)/2);
    const clamp = (value, margin) => Math.max(-margin,Math.min(margin,value));
    const shiftU = u-clamp(u,marginU), shiftV = v-clamp(v,marginV);
    const shiftX = shiftU*cos-shiftV*sin, shiftY = shiftU*sin+shiftV*cos;
    if (ratio > 1+1e-9 || Math.abs(shiftX)+Math.abs(shiftY) > 1e-5) image.$setTransform(a*ratio,b*ratio,c*ratio,d*ratio,e+shiftX,f+shiftY);
  };
  const refresh = async () => {
    fit();
    const token = ++pending;
    const [a,b] = image.$getTransform();
    onChange?.({ size: outputSize(), angle: Math.atan2(b,a)*180/Math.PI, zoom: Math.hypot(a,b) / (width/Math.min(native.naturalWidth,native.naturalHeight)) });
    const result = await selection.$toCanvas({ width: 192, height: 192 });
    if (!disposed && token === pending) preview.getContext('2d').drawImage(result, 0, 0, preview.width, preview.height);
  };
  selection.$change(0, 0, width, width, 1);
  image.$center('cover');
  if (settings) restore(settings);
  image.addEventListener('transform', () => {
    if (disposed || frameId !== null) return;
    frameId = requestAnimationFrame(() => { frameId = null; if (!disposed) void refresh().catch(() => {}); });
  });
  const resize = new ResizeObserver(() => {
    const nextWidth = canvas.clientWidth;
    if (!nextWidth || nextWidth === width || disposed) return;
    const saved = getSettings(); width = nextWidth;
    selection.$change(0, 0, width, width, 1); restore(saved); void refresh().catch(() => {});
  });
  resize.observe(canvas);
  try { await refresh(); } catch (error) { disposed = true; resize.disconnect(); cropper.destroy(); throw error; }
  return {
    rotate(degrees) { image.$rotate(`${degrees}deg`); },
    setAngle(degrees) { const [a,b] = image.$getTransform(); image.$rotate(`${degrees-Math.atan2(b,a)*180/Math.PI}deg`); },
    setZoom(value) { const [a,b] = image.$getTransform(); const target = width/Math.min(native.naturalWidth,native.naturalHeight)*value; image.$scale(target/Math.hypot(a,b)); },
    move(x,y) { image.$move(x,y); },
    reset() { image.$resetTransform().$center('cover'); },
    async export() {
      fit();
      const size = outputSize();
      const output = await selection.$toCanvas({ width: size, height: size, beforeDraw(context) { context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; } });
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not create the cropped photo');
      return { file: new File([blob], 'profile-photo.png', { type: 'image/png' }), data: output.toDataURL('image/png'), crop: { ...getSettings(), output_size: size } };
    },
    destroy() { disposed = true; pending++; cancelAnimationFrame(frameId); resize.disconnect(); cropper.destroy(); }
  };
}
