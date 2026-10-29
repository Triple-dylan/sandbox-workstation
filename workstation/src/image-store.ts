let database: Promise<IDBDatabase> | undefined;
function openImages() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('workstation-images', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('images');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      database = undefined;
      reject(r.error);
    };
  }));
}
export async function saveImage(key: string, blob: Blob) {
  const db = await openImages();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Image storage canceled'));
  });
}
export async function getImage(key: string): Promise<Blob | undefined> {
  const db = await openImages();
  return new Promise((resolve, reject) => {
    const request = db.transaction('images').objectStore('images').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function inspectImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    throw new Error('This file could not be read as an image. Your canvas is unchanged.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
