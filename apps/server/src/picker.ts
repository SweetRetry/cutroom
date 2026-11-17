/**
 * The system's own "choose folder" window. A browser page can't learn a folder's absolute path,
 * and the project is named by one, so the local service asks the OS for it. Resolves to null
 * when the reviewer cancels.
 */

import { ProjectError } from "./project"

const PROMPT = "选择视频项目文件夹"

const COMMANDS: Partial<Record<NodeJS.Platform, string[]>> = {
  // `activate` brings osascript's dialog in front of the browser that asked for it.
  darwin: [
    "osascript",
    "-e",
    "activate",
    "-e",
    `POSIX path of (choose folder with prompt "${PROMPT}")`,
  ],
  linux: ["zenity", "--file-selection", "--directory", `--title=${PROMPT}`],
  win32: [
    "powershell",
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${PROMPT}'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`,
  ],
}

export async function pickFolder(): Promise<string | null> {
  const command = COMMANDS[process.platform]
  if (!command) throw new ProjectError("这个系统不能弹出选择窗口，请粘贴文件夹路径")
  let proc
  try {
    proc = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" })
  } catch {
    throw new ProjectError("没能打开选择窗口，请粘贴文件夹路径")
  }
  const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  // A cancel exits non-zero (osascript -128, zenity 1) or prints nothing (PowerShell).
  const path = out.trim().replace(/(.)\/$/, "$1")
  return path || null
}
