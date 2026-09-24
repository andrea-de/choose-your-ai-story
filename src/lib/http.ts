import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { GenerationError, PageNotFoundError, StoryNotFoundError } from './story/service'

/** Maps service errors to HTTP responses. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof StoryNotFoundError || error instanceof PageNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (error instanceof GenerationError) {
    console.error(error)
    return NextResponse.json({ error: 'The quill slipped. Please try again.' }, { status: 502 })
  }
  console.error(error)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}

export function parsePageNumber(value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null
  const n = Number(value)
  return n >= 1 ? n : null
}
