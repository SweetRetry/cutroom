import { Link } from "@tanstack/react-router"

export function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-4xl font-semibold">没有这个页面</h1>
      <p className="mt-4 text-sm text-muted-foreground">检查地址，或回到首页。</p>
      <Link to="/" className="link mt-4 inline-block text-sm text-primary">
        回到首页
      </Link>
    </main>
  )
}
