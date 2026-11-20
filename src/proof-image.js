const photoLimit = 2 * 1024 * 1024;

export async function prepareProofImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (file.size <= photoLimit && /^image\/(?:jpeg|png|webp)$/i.test(file.type)) return file;
    const ratio = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.86, .73, .58]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= photoLimit) return new File([blob], '收退款凭证.jpg', { type: blob.type });
    }
  } catch {
    throw new Error('无法读取凭证图片，请选择 JPG、PNG 或 WebP。');
  } finally {
    URL.revokeObjectURL(url);
  }
  throw new Error('凭证图片过大，请换一张较小的图片。');
}
