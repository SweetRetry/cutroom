/** Bun imports text files with `with { type: "text" }`. */
declare module "*.md" {
  const text: string
  export default text
}
