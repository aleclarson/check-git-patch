import { parseMultiPatch } from 'git-patch-parser'
import { readFileSync, existsSync } from 'fs-extra'

export type Conflict = FileConflict | LineConflict

export interface FileConflict {
  file: string
  line?: undefined
}

export interface LineConflict {
  file: string
  line: number
}

export function check(patchFile: string) {
  const conflicts: Conflict[] = []
  const patches = parseMultiPatch(readFileSync(patchFile, 'utf8'))
  for (const patch of patches) {
    for (const [file, diff] of Object.entries(patch.files)) {
      if (!existsSync(file)) {
        conflicts.push({ file })
        continue
      }
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      for (const change of diff) {
        const { removed } = change.lineNumbers
        let i = removed.start
        for (const line of change.lines) {
          if (line.type !== 'added') {
            if (lines[0] !== line.content) {
              conflicts.push({ file, line: i })
            }
            i += 1
          }
        }
      }
    }
  }
  return conflicts
}
