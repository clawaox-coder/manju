export type ErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_TOKEN'
  | 'INSUFFICIENT_PERMISSION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(opts: { code: ErrorCode; message: string; status: number; details?: Record<string, unknown> }) {
    super(opts.message);
    this.name = 'AppError';
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

export const invalidInput = (message: string, details?: Record<string, unknown>) =>
  new AppError({ code: 'INVALID_INPUT', status: 400, message, details });

export const invalidToken = (message = 'token 无效或已过期') =>
  new AppError({ code: 'INVALID_TOKEN', status: 401, message });

export const forbidden = (message = '权限不足') =>
  new AppError({ code: 'INSUFFICIENT_PERMISSION', status: 403, message });

export const notFound = (message = '资源不存在') =>
  new AppError({ code: 'NOT_FOUND', status: 404, message });

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError({ code: 'CONFLICT', status: 409, message, details });

export const internal = (message = '内部错误') =>
  new AppError({ code: 'INTERNAL_ERROR', status: 500, message });
