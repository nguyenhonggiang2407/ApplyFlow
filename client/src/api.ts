let csrfToken = '';
export function setCsrf(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.', 0);
  }
  if (response.status === 204) return undefined as T;
  const result = await response
    .json()
    .catch(() => ({ error: 'Máy chủ trả về dữ liệu không hợp lệ.' }));
  if (!response.ok)
    throw new ApiError(
      result.error ?? 'Không thể hoàn thành yêu cầu.',
      response.status,
      result.fields ?? [],
    );
  return result as T;
}
