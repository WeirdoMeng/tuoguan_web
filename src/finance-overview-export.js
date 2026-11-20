function truncate(text, length) {
  return text.slice(0, length).replace(/[\uD800-\uDBFF]$/, '');
}

export function downloadFinanceWorkbook(blob, filenameParts) {
  const name = truncate(filenameParts.map(part => String(part ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim()).filter(Boolean).join('-'), 72) || '财务报表';
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' }).format(new Date());
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${name}-${day}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
