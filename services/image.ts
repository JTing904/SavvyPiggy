/**
 * Shrinks a picked photo to something a Firestore document can carry, so goal
 * covers work on the free plan without Cloud Storage. A phone photo is several
 * megabytes; this brings it down to tens of kilobytes.
 */

/** Longest edge after resizing. Cards render at ~260px, detail at ~400px. */
const MAX_EDGE = 720;

/** Firestore caps a document at 1 MiB; leave plenty of room for the rest. */
const MAX_DATA_URL_BYTES = 700_000;

/** Tried in order until the encoded image fits. */
const QUALITIES = [0.72, 0.6, 0.5, 0.4, 0.3];

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });

/** Aspect ratio is preserved; the layout crops with object-cover instead. */
const scaledSize = (img: HTMLImageElement) => {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  return {
    width: Math.round(img.naturalWidth * scale),
    height: Math.round(img.naturalHeight * scale),
  };
};

export const compressImage = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');

  const img = await loadImage(file);
  const { width, height } = scaledSize(img);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image.');
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_BYTES) return dataUrl;
  }

  throw new Error('That image is too detailed to store. Try a smaller one.');
};
