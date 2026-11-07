/** What the user reads when the server sends no message of its own. */
const STATUS_MESSAGES: Record<number, string> = {
  0: 'تعذّر الاتصال بالسيرفر، اتأكد من الإنترنت وحاول تاني',
  400: 'البيانات المرسلة فيها مشكلة',
  401: 'انتهت الجلسة، سجّل الدخول تاني',
  403: 'ليس لديك صلاحية لهذا الإجراء',
  404: 'العنصر المطلوب غير موجود',
  409: 'العملية تتعارض مع بيانات موجودة',
  413: 'حجم الملف أكبر من المسموح',
  429: 'محاولات كتير ورا بعض، استنى دقيقة وحاول تاني',
  500: 'حصل خطأ في السيرفر، حاول تاني بعد شوية',
  503: 'الخدمة مش متاحة دلوقتي، حاول تاني بعد شوية',
};

/**
 * Every failed request ends up as one of these: a status and one or more
 * human-readable Arabic messages, whether the server sent them or not.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[]) {
    const list = messages.length
      ? messages
      : [STATUS_MESSAGES[status] ?? STATUS_MESSAGES[500]];
    super(list.join('\n'));
    this.name = 'ApiError';
    this.status = status;
    this.messages = list;
  }

  /** Nest sends { message: string | string[] }; anything else falls back by status. */
  static fromBody(status: number, body: unknown): ApiError {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? (body as { message: unknown }).message
        : undefined;
    const list = Array.isArray(message) ? message : [message];
    // keep the API's Arabic messages; English framework defaults
    // ("Bad Request", "email must be an email") give way to the status message
    const messages = list.filter(
      (m): m is string => typeof m === 'string' && /[؀-ۿ]/.test(m),
    );
    return new ApiError(status, messages);
  }

  static network(): ApiError {
    return new ApiError(0, []);
  }

  /** A stale version: someone else changed the record since it was opened. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

export function errorMessages(error: unknown): string[] {
  if (error instanceof ApiError) return error.messages;
  return [STATUS_MESSAGES[500]];
}
