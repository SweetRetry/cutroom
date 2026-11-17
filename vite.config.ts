import { defineConfig } from "vite-plus"

/**
 * Workspace-wide lint, format and test settings for Vite+ (`vp lint`, `vp fmt`, `vp test`).
 * App build and dev settings live in each app's own vite.config.ts.
 */
export default defineConfig({
  fmt: {
    semi: false,
    printWidth: 100,
    trailingComma: "es5",
    sortPackageJson: true,
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "**/db/migrations/**",
      "packages/ui/src/components/**",
      "pnpm-lock.yaml",
      ".agents/skills/sweet-mode/**",
    ],
  },
  lint: {
    plugins: ["typescript", "react", "jsx-a11y", "import"],
    jsPlugins: ["@shadcn/lint"],
    settings: {
      shadcn: {
        note: "Component appearance belongs to packages/ui variants (AGENTS.md › Architecture). Design rules are routed from DESIGN.md.",
        componentImports: ["^@workspace/ui/components"],
      },
    },
    rules: {
      // `const { node, ...props } = p` is how a prop is dropped before spreading the rest.
      "no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      "shadcn/no-restyle": [
        "error",
        {
          allow: ["layout"],
          contracts: [
            {
              pattern:
                "^(?:Card|CardHeader|CardContent|CardFooter|DialogContent|DialogHeader|DialogFooter|AlertDialogContent|AlertDialogHeader|AlertDialogFooter|SheetContent|SheetHeader|SheetFooter|DrawerContent|DrawerHeader|DrawerFooter|PopoverContent|HoverCardContent|TabsContent|AccordionContent|CollapsibleContent|ScrollArea|ResizablePanel|SidebarContent|SidebarHeader|SidebarFooter|SidebarGroup|SidebarGroupContent|FormItem|Field|FieldGroup|FieldSet|Alert)$",
              allow: ["layout", "spacing", "rounded"],
            },
            {
              pattern:
                "^(?:CardTitle|CardDescription|DialogTitle|DialogDescription|AlertDialogTitle|AlertDialogDescription|SheetTitle|SheetDescription|DrawerTitle|DrawerDescription|AlertTitle|AlertDescription|TableHead|TableCell|TableCaption|FormLabel|FormDescription|FieldLabel|FieldDescription|FieldLegend)$",
              allow: ["layout", "spacing", "typography"],
            },
          ],
        },
      ],
      "shadcn/no-raw-colors": "error",
      "shadcn/no-unknown-classes": "error",
      "shadcn/require-static-classes": "error",
      "shadcn/no-inline-styles": "error",
      "shadcn/no-arbitrary-values": ["error", { allow: ["layout"] }],
    },
    overrides: [
      {
        // The player and the timeline place things by time and by the video's letterboxed frame:
        // positions and widths are computed per render, so they are inline styles, and lane
        // colors are canvas fills read from tokens. `no-restyle` still applies.
        files: ["apps/web/src/components/{player,timeline}/**"],
        rules: {
          "shadcn/no-inline-styles": "off",
        },
      },
    ],
    ignorePatterns: [
      "packages/ui/src/components/**",
      "**/routeTree.gen.ts",
      ".agents/skills/sweet-mode/**",
    ],
  },
  test: {
    // apps/server runs under `bun test` (it needs Bun.spawn and Bun.file).
    projects: ["packages/*"],
  },
})
