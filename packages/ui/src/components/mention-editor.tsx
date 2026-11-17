"use client"

import { Extension, Node, mergeAttributes, type JSONContent } from "@tiptap/core"
import { Document } from "@tiptap/extension-document"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { Placeholder, UndoRedo } from "@tiptap/extensions"
import { PluginKey } from "@tiptap/pm/state"
import { EditorContent, useEditor } from "@tiptap/react"
import { Suggestion } from "@tiptap/suggestion"
import { cn } from "cn"
import * as React from "react"
import { createPortal } from "react-dom"

/**
 * A text control that can hold mentions: things picked from an `@` menu, shown as chips the
 * caret steps over and Backspace removes whole. It is bare, like `InputGroupTextarea`: put it
 * in an `InputGroup`, which draws the field and holds its buttons. Adapted from motif's prompt input
 * (`agents/prompt-input`): the editor, the trigger menu and the document-to-segments trip.
 */

/** The draft as text runs and the things picked out of the menu. */
export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; id: string; label: string }

export type MentionItem = {
  id: string
  /** Shown on the chip, and what the typed query is matched against. */
  label: string
  description?: string
  icon?: React.ReactNode
}

export type MentionEditorHandle = {
  focus: () => void
  clear: () => void
  /** Puts a chip at the caret, as if picked from the menu. */
  insert: (item: MentionItem) => void
}

type MentionEditorProps = {
  items: MentionItem[]
  placeholder?: string
  /** Every change, as segments; trimmed at both ends. */
  onChange?: (segments: MentionSegment[]) => void
  /** ⌘/Ctrl+Enter. Plain Enter breaks the line; with the menu open it picks the row. */
  onSubmit?: () => void
  className?: string
  "aria-label"?: string
}

const attribute = (name: string) => ({
  default: "",
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`) ?? "",
  renderHTML: (attributes: Record<string, string>) => ({ [`data-${name}`]: attributes[name] }),
})

/** An atom: the caret can't stop inside it, and a selection holds all of it or none. */
const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ id: attribute("id"), label: attribute("label") }),
  parseHTML: () => [{ tag: "span[data-mention]" }],
  renderHTML: ({ HTMLAttributes, node }) => [
    "span",
    mergeAttributes(HTMLAttributes, {
      "data-mention": "",
      // One rung above the field's fill, so the chip reads inside it.
      class: "rounded-sm bg-surface-3 px-1 py-px font-medium text-foreground",
    }),
    `@${node.attrs.label}`,
  ],
  renderText: ({ node }) => `@${node.attrs.label}`,
})

const Keys = Extension.create<{ submit: () => void }>({
  name: "mentionEditorKeys",
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => {
        this.options.submit()
        return true
      },
      Escape: ({ editor }) => {
        editor.commands.blur()
        return true
      },
    }
  },
})

/** The document as segments: a paragraph break is a newline, adjacent text merges. */
function toSegments(doc: JSONContent): MentionSegment[] {
  const out: MentionSegment[] = []
  const text = (t: string) => {
    if (!t) return
    const last = out.at(-1)
    if (last?.type === "text") last.text += t
    else out.push({ type: "text", text: t })
  }
  for (const [i, paragraph] of (doc.content ?? []).entries()) {
    if (i > 0) text("\n")
    for (const node of paragraph.content ?? []) {
      if (node.type === "mention")
        out.push({ type: "mention", id: String(node.attrs?.id), label: String(node.attrs?.label) })
      else text(node.text ?? "")
    }
  }
  const first = out[0]
  if (first?.type === "text") first.text = first.text.trimStart()
  const last = out.at(-1)
  if (last?.type === "text") last.text = last.text.trimEnd()
  return out.filter((s) => s.type === "mention" || s.text.length > 0)
}

type Menu = { items: MentionItem[]; index: number; command: (item: MentionItem) => void }

const PLACEHOLDER =
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-subtle-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"

function MentionEditor({
  ref,
  items,
  placeholder,
  onChange,
  onSubmit,
  className,
  "aria-label": label,
}: MentionEditorProps & { ref?: React.Ref<MentionEditorHandle> }) {
  // The editor is built once; what it calls back into is read through here.
  const latest = React.useRef({ items, placeholder, onChange, onSubmit })
  React.useEffect(() => {
    latest.current = { items, placeholder, onChange, onSubmit }
  })
  const [menu, setMenu] = React.useState<Menu | null>(null)
  const live = React.useRef<Menu | null>(null)
  const [host] = React.useState(() => document.createElement("div"))

  const editor = useEditor(
    {
      immediatelyRender: false,
      editorProps: {
        attributes: {
          role: "textbox",
          // The bare control of an InputGroup, which draws the field and its focus.
          "data-slot": "input-group-control",
          "aria-multiline": "true",
          ...(label && { "aria-label": label }),
          class: "min-h-12 px-2.5 py-2 whitespace-pre-wrap break-words outline-none",
        },
      },
      extensions: [
        Document,
        Paragraph,
        Text,
        UndoRedo,
        Mention,
        Placeholder.configure({ placeholder: () => latest.current.placeholder ?? "" }),
        Keys.configure({ submit: () => latest.current.onSubmit?.() }),
      ],
      onUpdate: ({ editor: e }) => latest.current.onChange?.(toSegments(e.getJSON())),
    },
    []
  )

  React.useEffect(() => {
    if (!editor) return
    const key = new PluginKey("mention-menu")
    let unmount: (() => void) | undefined
    const show = (next: Menu | null) => {
      live.current = next
      setMenu(next)
    }
    const plugin = Suggestion<MentionItem>({
      editor,
      char: "@",
      pluginKey: key,
      placement: "top-start",
      offset: { mainAxis: 8, crossAxis: 0 },
      items: ({ query }) => {
        const needle = query.toLowerCase()
        return latest.current.items.filter((i) => i.label.toLowerCase().includes(needle))
      },
      command: ({ editor: e, range, props: item }) => {
        const { nodeAfter } = e.state.doc.resolve(range.to)
        const to = nodeAfter?.text?.startsWith(" ") ? range.to + 1 : range.to
        e.chain()
          .focus()
          .insertContentAt({ from: range.from, to }, [
            { type: "mention", attrs: { id: item.id, label: item.label } },
            { type: "text", text: " " },
          ])
          .run()
      },
      render: () => ({
        onStart: (props) => {
          unmount = props.mount(host)
          show({ items: props.items, index: 0, command: props.command })
        },
        onUpdate: (props) => show({ items: props.items, index: 0, command: props.command }),
        onExit: () => {
          unmount?.()
          unmount = undefined
          show(null)
        },
        onKeyDown: ({ event }) => {
          const current = live.current
          if (!current || current.items.length === 0) return false
          const n = current.items.length
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const step = event.key === "ArrowDown" ? 1 : -1
            show({ ...current, index: (current.index + step + n) % n })
            return true
          }
          if (event.key === "Enter" || event.key === "Tab") {
            current.command(current.items[current.index]!)
            return true
          }
          return false
        },
      }),
    })
    // First in line, so an open menu sees Enter before the field does.
    editor.registerPlugin(plugin, (added, rest) => [added, ...rest])
    return () => {
      unmount?.()
      editor.unregisterPlugin(key)
      show(null)
    }
  }, [editor, host])

  React.useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus("end"),
      clear: () => {
        editor?.commands.clearContent(true)
      },
      insert: (item) => {
        editor
          ?.chain()
          .focus()
          .insertContent([
            { type: "mention", attrs: { id: item.id, label: item.label } },
            { type: "text", text: " " },
          ])
          .run()
      },
    }),
    [editor]
  )

  return (
    <div
      data-slot="mention-editor"
      className={cn(
        "max-h-48 w-full flex-1 overflow-y-auto text-base md:text-sm [&_.ProseMirror-selectednode]:bg-surface-3",
        PLACEHOLDER,
        className
      )}
    >
      <EditorContent editor={editor} />
      {menu &&
        menu.items.length > 0 &&
        createPortal(
          <ul
            role="listbox"
            aria-label="提及"
            className="max-h-64 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground duration-100 animate-in fade-in-0 zoom-in-95"
          >
            {menu.items.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === menu.index}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5",
                  index === menu.index && "bg-accent text-accent-foreground"
                )}
                // Down on a row would move focus out of the field, and the menu with it.
                onMouseDown={(event) => {
                  event.preventDefault()
                  menu.command(item)
                }}
                onMouseMove={() => index !== menu.index && setMenu({ ...menu, index })}
              >
                {item.icon}
                <span className="min-w-0 truncate font-medium">{item.label}</span>
                {item.description && (
                  <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                )}
              </li>
            ))}
          </ul>,
          host
        )}
    </div>
  )
}

export { MentionEditor }
