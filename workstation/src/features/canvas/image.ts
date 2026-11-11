/** Shrinks a picture so it travels and stores comfortably, and reports its shape for placement. */
export async function readImage(file: Blob, max = 1100) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
