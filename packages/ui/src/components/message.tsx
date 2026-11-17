import { cn } from "cn"
import * as React from "react"

/**
 * One turn in a conversation, after motif's `message`: the reader's own turn sits against the
 * trailing edge in a filled bubble, a turn to them runs full width on the page's surface, and
 * a system note sits centred and recedes. The role rides as `data-from`.
 */
type MessageFrom = "user" | "assistant" | "system"

const MessageContext = React.createContext<MessageFrom>("assistant")

function Message({
  from,
  className,
  ...props
}: React.ComponentProps<"article"> & { from: MessageFrom }) {
  return (
    <MessageContext.Provider value={from}>
      <article
        data-slot="message"
        data-from={from}
        className={cn(
          "flex w-full",
          from === "user" && "flex-row-reverse",
          from === "system" && "justify-center",
          className
        )}
        {...props}
      />
    </MessageContext.Provider>
  )
}

/**
 * The body, shaped by the turn's role. A bubble is a fill inside the thread, not a surface;
 * `highlighted` lifts it a rung, for the turn the rest of the page is pointing at.
 */
function MessageContent({
  className,
  highlighted = false,
  ...props
}: React.ComponentProps<"div"> & { highlighted?: boolean }) {
  const from = React.useContext(MessageContext)
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex min-w-0 flex-col gap-1.5 leading-relaxed",
        from === "user" &&
          "max-w-[85%] rounded-2xl bg-muted px-3 py-2 break-words transition-colors",
        from === "user" && highlighted && "bg-surface-3",
        // The bubble is a fill, so a ghost button inside it hovers a rung up (DESIGN.md › Input group).
        from === "user" && "[&_[data-variant=ghost]:hover]:bg-surface-3",
        from === "assistant" && "flex-1",
        from === "system" && "max-w-[85%] text-center text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Message, MessageContent }
