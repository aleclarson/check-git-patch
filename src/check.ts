import { parseMultiPatch, DiffChunk } from 'git-patch-parser'
import { readFileSync, existsSync } from 'fs-extra'

export type Conflict = {
  /** The target file */
  file: string
  /** When defined, a diff has a line that does not match the filesystem */
  line?: number
  /** The expected text */
  text?: string
  /** When defined, a rename failed because `dest` already exists */
  dest?: string
  /** When defined, the patch is corrupted */
  error?: string
}

export function check(patchFile: string) {
  const patches = parseMultiPatch(readFileSync(patchFile, 'utf8'))
  const conflicts: Conflict[] = []

  for (const patch of patches) {
    const visited = new Map<string, boolean>()

    for (const change of patch.changes) {
      const { file } = change

      let exists = visited.get(file)
      if (exists == null) {
        visited.set(file, (exists = existsSync(file)))

        // For added files, the file must *not* already exist.
        // Otherwise, the file must exist.
        if (exists == (change.type == 'add')) {
          conflicts.push({ file })
          continue
        }
      }

      // For renamed files, the dest must not already exist.
      if (change.type == 'rename') {
        const { dest } = change
        let exists = visited.get(dest)
        if (exists == null) {
          visited.set(dest, (exists = existsSync(dest)))
          if (exists) {
            conflicts.push({ file, dest })
          }
        }
      } else if ('diff' in change) {
        getLineConflicts(change, conflicts)
      }
    }
  }

  return { patches, conflicts }
}

type Change = {
  file: string
  diff: DiffChunk[]
}

function getLineConflicts({ file, diff }: Change, conflicts: Conflict[]) {
  let offset = 0 // Line offset from preceding chunks in the same file.
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  for (const chunk of diff) {
    let oldLength = 0 // Line count before any changes.
    let newLength = 0 // Line count after any changes.

    let { start: i } = chunk.inputRange
    for (const { prefix, text } of chunk.lines) {
      if (prefix !== '-') {
        newLength++
      }
      if (prefix !== '+') {
        if (lines[i - 1] !== text) {
          conflicts.push({ file, line: i, text })
        }
        oldLength++
        i++
      }
    }

    const { inputRange, outputRange } = chunk
    if (!isNaN(inputRange.length) || oldLength !== newLength) {
      if (oldLength !== inputRange.length) {
        conflicts.push({
          file,
          line: inputRange.start,
          error: `Input range has length of ${inputRange.length}, but ${oldLength} lines exist in the diff.`,
        })
      }
      if (newLength !== outputRange.length) {
        conflicts.push({
          file,
          line: inputRange.start,
          error: `Output range has length of ${outputRange.length}, but ${newLength} lines exist in the diff.`,
        })
      }
    }
    const expectedLength = newLength > 0 ? inputRange.start + offset : 0
    if (outputRange.start !== expectedLength) {
      conflicts.push({
        file,
        line: inputRange.start,
        error: `Output range says it starts on line ${
          outputRange.start
        }, but it actually starts on line ${inputRange.start + offset}.`,
      })
    }
    offset += newLength - oldLength
  }
}
