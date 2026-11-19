import type { NextFunction, Request, Response } from 'express'

export class AppError extends Error {
  constructor(
    public code: number,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export function ok<T>(res: Response, data: T, msg = 'ok') {
  return res.json({ code: 0, msg, data })
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, msg: err.message, data: null })
  }
  const message = err instanceof Error ? err.message : '服务内部错误'
  console.error('[BFF]', err)
  return res.status(500).json({ code: 50000, msg: message, data: null })
}
