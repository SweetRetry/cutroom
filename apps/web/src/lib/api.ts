import { treaty } from "@elysiajs/eden"
import type { App } from "server/app"

/** The local service, typed end to end from its Elysia routes. The only place responses are parsed. */
export const api = treaty<App>(window.location.origin).api

/** Unwraps an Eden response, turning the service's `{ message }` errors into thrown Errors. */
export async function unwrap<T>(
  request: Promise<{ data: T; error: unknown }>
): Promise<NonNullable<T>> {
  const { data, error } = await request
  if (error) {
    const value = (error as { value?: unknown }).value
    const message =
      value && typeof value === "object" && "message" in value
        ? String(value.message)
        : "本地服务没有响应"
    throw new Error(message)
  }
  return data as NonNullable<T>
}

const qs = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))

/** URLs the browser loads directly (video, images), so seeking uses HTTP ranges. */
export const mediaUrl = (p: string, file: string) => `/api/media?${qs({ p, file })}`
export const thumbUrl = (p: string, file: string, t: number, w: number) =>
  `/api/thumb?${qs({ p, file, t: Math.round(t * 10) / 10, w })}`
