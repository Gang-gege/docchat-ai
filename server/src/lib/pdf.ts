import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

export function parsePdf(buf: Buffer) {
  return pdfParse(buf)
}
