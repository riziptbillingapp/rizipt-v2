/**
 * Reads an image file, downsizes it to fit within maxDim on its longest side,
 * and returns a compressed JPEG/PNG data URI small enough to store as TEXT in D1.
 */
export function fileToCompressedDataUrl(file, maxDim = 320, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const isPng = file.type === "image/png";
        resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Scans a loaded <canvas> for the bounding box of "real content" — pixels that
 * are neither transparent nor near-white background — and returns that box.
 * Used to trim the blank margins scanned stamp/signature images usually carry
 * around the actual ink, so the stored image is tightly cropped to the mark
 * itself instead of a mostly-empty square that renders tiny wherever it's
 * placed at a small fixed size (e.g. a document's signature block).
 */
function findContentBounds(ctx, width, height, { alphaThreshold = 10, whiteThreshold = 248 } = {}) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      const isBackground = a < alphaThreshold || (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold);
      if (!isBackground) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null; // nothing found — fully blank image
  return { minX, minY, maxX, maxY };
}

/**
 * Reads an image file (typically a scanned/photographed seal or signature),
 * crops it tightly to its visible content with a small padding margin, then
 * downsizes to fit maxDim. This is what makes a stamp/signature render at a
 * realistic size in documents instead of shrinking along with a lot of
 * surrounding blank space that came from the original scan/photo.
 */
export function fileToCroppedStampDataUrl(file, { maxDim = 480, quality = 0.92, paddingRatio = 0.05 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = img.width;
        fullCanvas.height = img.height;
        const fullCtx = fullCanvas.getContext("2d");
        fullCtx.drawImage(img, 0, 0);

        const bounds = findContentBounds(fullCtx, img.width, img.height);
        const isPng = file.type === "image/png";

        // If we couldn't detect a content region (e.g. a fully-transparent
        // or solid-color image), fall back to the un-cropped image rather
        // than failing the upload.
        const box = bounds
          ? (() => {
              const padX = Math.round((bounds.maxX - bounds.minX) * paddingRatio) + 4;
              const padY = Math.round((bounds.maxY - bounds.minY) * paddingRatio) + 4;
              return {
                x: Math.max(0, bounds.minX - padX),
                y: Math.max(0, bounds.minY - padY),
                w: Math.min(img.width, bounds.maxX - bounds.minX + padX * 2),
                h: Math.min(img.height, bounds.maxY - bounds.minY + padY * 2),
              };
            })()
          : { x: 0, y: 0, w: img.width, h: img.height };

        let { w: width, h: height } = box;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const outCanvas = document.createElement("canvas");
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext("2d");
        outCtx.drawImage(fullCanvas, box.x, box.y, box.w, box.h, 0, 0, width, height);

        resolve(outCanvas.toDataURL(isPng ? "image/png" : "image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
