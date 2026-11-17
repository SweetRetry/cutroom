"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

/**
 * A full-window viewer for pictures and footage. Unlike Dialog it puts nothing around the
 * media: no card, border or padding, on pure black so colors are judged true. It always uses
 * the dark tokens, whatever the page theme.
 */
function Lightbox({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="lightbox" {...props} />
}

function LightboxContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="lightbox-backdrop"
        className="fixed inset-0 isolate z-50 bg-black duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Popup
        data-slot="lightbox-content"
        className={cn(
          "dark fixed inset-0 z-50 flex flex-col text-sm text-foreground outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function LightboxTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="lightbox-title"
      className={cn("min-w-0 truncate font-medium", className)}
      {...props}
    />
  )
}

function LightboxDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="lightbox-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

function LightboxClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="lightbox-close" {...props} />
}

export { Lightbox, LightboxClose, LightboxContent, LightboxDescription, LightboxTitle }
