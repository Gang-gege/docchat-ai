import { AppError } from '../middleware/error-handler.js'

/** 识别图片中的中英文。语言包首次使用时会下载。 */
export async function ocrImage(filePath: string) {
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('chi_sim+eng')
    try {
      const result = await worker.recognize(filePath)
      return (result.data.text || '').trim()
    } finally {
      await worker.terminate()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR 失败'
    throw new AppError(50001, `图片 OCR 失败：${message}`, 500)
  }
}
