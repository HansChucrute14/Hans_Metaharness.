'use client'

import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Keyboard,
  Command,
  Navigation,
  Zap,
  ListChecks,
  Search,
  Github,
  BrainCircuit,
  Terminal,
} from 'lucide-react'

/* ─── TYPES ─── */
export interface KeyboardShortcut {
  /** Key combination to display (e.g. "⌘K", "G then O", "?") */
  keys: string[]
  /** What the shortcut does */
  description: string
  /** Whether the shortcut requires a modifier (shown as label) */
  modifier?: string
}

export interface ShortcutCategory {
  id: string
  label: string
  icon: React.ElementType
  iconClass: string
  shortcuts: KeyboardShortcut[]
}

export interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/* ─── SHORTCUT DEFINITIONS ─── */
const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: 'global',
    label: 'Global',
    icon: Command,
    iconClass: 'text-violet-600',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette (Ctrl+K on Windows/Linux)' },
      { keys: ['?'], description: 'Show this keyboard shortcuts dialog' },
      { keys: ['Esc'], description: 'Close any open dialog, panel, or clear focus' },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    icon: Navigation,
    iconClass: 'text-teal-600',
    shortcuts: [
      { keys: ['G', 'O'], description: 'Go to Overview tab' },
      { keys: ['G', 'F'], description: 'Go to Findings tab' },
      { keys: ['G', 'R'], description: 'Go to Roadmap tab' },
      { keys: ['G', 'U'], description: 'Go to Unified tab' },
      { keys: ['G', 'L'], description: 'Go to Files tab' },
      { keys: ['G', 'D'], description: 'Go to Deps tab' },
      { keys: ['G', 'A'], description: 'Go to Admin tab' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    icon: Zap,
    iconClass: 'text-amber-600',
    shortcuts: [
      { keys: ['B'], description: 'Toggle bookmarks filter' },
      { keys: ['C'], description: 'Open compare drawer' },
      { keys: ['E'], description: 'Expand / collapse all findings' },
      { keys: ['S'], description: 'Toggle bulk-select mode' },
      { keys: ['T'], description: 'Toggle light/dark theme' },
    ],
  },
  {
    id: 'findings',
    label: 'Findings',
    icon: ListChecks,
    iconClass: 'text-emerald-600',
    shortcuts: [
      { keys: ['J'], description: 'Focus next finding (scrolls into view)' },
      { keys: ['K'], description: 'Focus previous finding (scrolls into view)' },
      { keys: ['Enter'], description: 'Expand selected finding details' },
      { keys: ['X'], description: 'Add focused finding to compare tray' },
      { keys: ['/'], description: 'Focus the search input' },
    ],
  },
  {
    id: 'ai-tools',
    label: 'AI & Tools',
    icon: BrainCircuit,
    iconClass: 'text-teal-500',
    shortcuts: [
      { keys: ['⌘', 'Shift', 'A'], description: 'Open AI connector settings (Ollama/Local LLM)' },
      { keys: ['⌘', 'Shift', 'G'], description: 'Sync GitHub issues bidirectional' },
      { keys: ['⌘', 'Shift', 'O'], description: 'Open Opencode harness panel' },
    ],
  },
  {
    id: 'terminal',
    label: 'Terminal / Opencode',
    icon: Terminal,
    iconClass: 'text-orange-500',
    shortcuts: [
      { keys: ['⌘', 'Shift', 'T'], description: 'Send focused finding to Opencode for AI-driven fix' },
      { keys: ['⌘', 'Shift', 'R'], description: 'Run Opencode review on current codebase state' },
    ],
  },
]

/* ─── KBD ELEMENT ─── */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-[11px] font-medium font-mono rounded-md border border-border bg-muted text-foreground shadow-[0_1px_0_rgb(0,0,0,0.05)] dark:shadow-[0_1px_0_rgb(255,255,255,0.05)]"
      aria-label={typeof children === 'string' ? children : undefined}
    >
      {children}
    </kbd>
  )
}

/* ─── KEY COMBINATION DISPLAY ─── */
function KeyCombination({ shortcut }: { shortcut: KeyboardShortcut }) {
  // Special handling for "G then O" — display with arrow between
  if (shortcut.keys.length === 2 && shortcut.description.startsWith('Go to')) {
    return (
      <div className="flex items-center gap-1">
        <Kbd>{shortcut.keys[0]}</Kbd>
        <span className="text-[10px] text-muted-foreground mx-0.5">then</span>
        <Kbd>{shortcut.keys[1]}</Kbd>
      </div>
    )
  }
  // Default: render keys separated by + or as a single key
  return (
    <div className="flex items-center gap-1">
      {shortcut.keys.map((key, idx) => (
        <span key={idx} className="flex items-center gap-1">
          {idx > 0 && (
            <span className="text-[10px] text-muted-foreground mx-0.5">+</span>
          )}
          <Kbd>{key}</Kbd>
        </span>
      ))}
    </div>
  )
}

/* ─── MAIN DIALOG ─── */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-violet-600" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Speed up your workflow with these keyboard shortcuts. Press{' '}
            <Kbd>?</Kbd> anywhere to open this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-5 flex-1">
          {SHORTCUT_CATEGORIES.map((category, catIdx) => {
            const CatIcon = category.icon
            return (
              <motion.section
                key={category.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: catIdx * 0.05, duration: 0.2 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2 pb-1 border-b">
                  <CatIcon className={`h-4 w-4 ${category.iconClass}`} />
                  <h3 className="text-sm font-semibold">{category.label}</h3>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto">
                    {category.shortcuts.length} shortcuts
                  </Badge>
                </div>
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {category.shortcuts.map((shortcut, idx) => (
                        <tr
                          key={idx}
                          className={`border-b border-border/40 last:border-0 ${
                            idx % 2 === 1 ? 'bg-muted/30' : ''
                          }`}
                        >
                          <td className="py-2 px-3 align-middle w-1/3">
                            <KeyCombination shortcut={shortcut} />
                          </td>
                          <td className="py-2 px-3 align-middle text-foreground/90">
                            {shortcut.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            )
          })}
        </div>

        {/* Footer tips */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-violet-600" />
            <p className="leading-snug">
              <span className="font-medium text-foreground">Search syntax tip:</span>{' '}
              In the command palette, you can use structured filters like{' '}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">
                severity:critical
              </code>{' '}
              or{' '}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">
                status:not-started
              </code>
              .
            </p>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Github className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p className="leading-snug">
              Some shortcuts may be unavailable while a dialog is open or while
              focused on an input field. Press <Kbd>Esc</Kbd> to release focus.
            </p>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <BrainCircuit className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-teal-500" />
            <p className="leading-snug">
              <span className="font-medium text-foreground">AI & Tools:</span>{' '}
              Connect local LLMs (Ollama), Opencode harness, and bidirectional GitHub sync via the Admin tab or keyboard shortcuts.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
