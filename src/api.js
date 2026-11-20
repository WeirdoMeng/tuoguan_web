export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request(path, options = {}) {
  const { method = 'GET', body, workbook = false } = options;
  let response;
  try {
    response = await fetch('/admin-api' + path, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      ...(body === undefined ? {} : body instanceof FormData ? { body } : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  } catch {
    throw new ApiError(0, '无法连接管理服务，请稍后重试。');
  }

  if (workbook && response.ok && response.headers.get('content-type')?.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
    return response.blob();
  }
  const result = await response.json().catch(() => null);
  if (!workbook && response.ok && result?.ok === true) return result.data;

  const detail = result?.error;
  const message = typeof detail === 'string' ? detail : detail?.message;
  throw new ApiError(
    response.status,
    message || (response.status === 503 || response.status >= 500
      ? '管理服务暂时不可用，请稍后重试。'
      : '操作未完成，请重试。'),
    detail?.code,
  );
}
