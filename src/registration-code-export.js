const titleFont = '700 34px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const subtitleFont = '500 22px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

function wrapText(context, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const character of text) {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paintText(context, lines, x, y, font, color, lineHeight) {
  context.font = font;
  context.fillStyle = color;
  for (const line of lines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function composeCode(imageUrl, title, subtitle) {
  if (typeof imageUrl !== 'string' || !/^data:image\/(?:png|jpeg);base64,/i.test(imageUrl)) {
    throw new Error('二维码图片不可用，请重新加载。');
  }
  const image = new Image();
  image.src = imageUrl;
  try {
    await image.decode();
  } catch {
    throw new Error('二维码图片无法解码，请重新加载。');
  }

  const sidePadding = Math.max(36, Math.ceil(image.naturalWidth * 0.13));
  const edge = 42;
  const titleLineHeight = 46;
  const subtitleLineHeight = 31;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(520, image.naturalWidth + 2 * sidePadding);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法导出二维码。');
  const textWidth = canvas.width - 2 * sidePadding;
  context.font = titleFont;
  const titles = wrapText(context, title, textWidth);
  context.font = subtitleFont;
  const subtitles = wrapText(context, subtitle, textWidth);
  const subtitleGap = subtitles.length ? 5 : 0;
  const imageTop = edge + titles.length * titleLineHeight + subtitleGap + subtitles.length * subtitleLineHeight + 28;
  canvas.height = imageTop + image.naturalHeight + edge;

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  const textBottom = paintText(context, titles, canvas.width / 2, edge, titleFont, '#111', titleLineHeight);
  paintText(context, subtitles, canvas.width / 2, textBottom + subtitleGap, subtitleFont, '#4b4b4b', subtitleLineHeight);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, Math.floor((canvas.width - image.naturalWidth) / 2), imageTop);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('二维码图片导出失败，请重试。'));
    }, 'image/png');
  });
}

async function createA4Pdf(png) {
  const { PDFDocument, PageSizes } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(PageSizes.A4);
  const poster = await pdf.embedPng(await png.arrayBuffer());
  const margin = 60;
  const scale = Math.min(400 / poster.width, (page.getHeight() - 2 * margin) / poster.height);
  const width = poster.width * scale;
  const height = poster.height * scale;
  page.drawImage(poster, { x: (page.getWidth() - width) / 2, y: page.getHeight() - margin - height, width, height });
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

export async function createRegistrationCodeFile({ imageUrl, title, subtitle = '', format }) {
  if (format !== 'image' && format !== 'pdf') throw new Error('请选择有效的二维码导出格式。');
  const heading = String(title ?? '').trim();
  if (!heading) throw new Error('缺少二维码标题，请重新加载。');
  const png = await composeCode(imageUrl, heading, String(subtitle ?? '').trim());
  return format === 'pdf' ? createA4Pdf(png) : png;
}
