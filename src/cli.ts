import log from 'lodge'
import slurm from 'slurm'
import { watch } from 'chokidar'
import { check } from './check'
import { existsSync, readFileSync } from 'fs-extra'

const prefix = '\n💥  '

export function run() {
  const args = slurm({
    w: { type: 'boolean' },
  })

  if (args.w) {
    return watch(args).on('all', () => {
      log.clear()
      if (!printConflicts(args, { reverse: true, limit: 10 })) {
        log('\n✨  No conflicts found.')
      }
    })
  }

  if (printConflicts(args)) {
    process.exit(1)
  } else {
    log('\n✨  No conflicts found.')
  }
}

type PrintOptions = {
  reverse?: boolean
  limit?: number
}

function printConflicts(
  args: string[],
  { reverse, limit = Infinity }: PrintOptions = {}
) {
  let count = 0
  let failed = false
  for (const patchFile of args) {
    if (!existsSync(patchFile)) {
      log(prefix + 'Patch does not exist: %s', log.yellow(patchFile))
      failed = true
      continue
    }

    const { conflicts } = check(patchFile)
    if (!conflicts.length) continue
    failed = true

    const prevCount = count
    count += conflicts.length
    if (prevCount >= limit) {
      continue
    }
    if (count > limit) {
      conflicts.splice(limit - prevCount, Infinity)
    }

    log(log.bold('\n>> Found conflicts in patch:'), log.silver(patchFile))

    // In watch mode, the conflicts are reversed, because the terminal
    // sticks to the bottom of the output.
    if (reverse) {
      conflicts.reverse()
    }

    type Range = { file: string; start: number; line: number; text: string }
    const ranges: Range[] = []

    let range: Range | undefined
    conflicts.forEach(({ file, dest, line, text = '', error }) => {
      if (error) {
        log(
          prefix + 'Diff for line %O of %s is corrupted:\n%s',
          line,
          log.yellow(file),
          log.red(error)
        )
      } else if (dest) {
        log(prefix + 'Rename failed. File already exists:', log.yellow(dest))
      } else if (line == null) {
        log(prefix + 'File does not exist:', log.yellow(file))
      } else if (
        range &&
        file == range.file &&
        line == (reverse ? range.start - 1 : range.line + 1)
      ) {
        if (reverse) {
          range.text = text + '\n' + range.text
          range.start--
        } else {
          range.text += '\n' + range.text
          range.line++
        }
      } else {
        range = { file, start: line, line, text }
        ranges.push(range)
      }
    })

    ranges.forEach(range => {
      const lines = readFileSync(range.file, 'utf8').split(/\r?\n/)

      const expected = log.green(range.text.replace(/^/gm, ' + '))
      const actual = log.red(
        lines
          .slice(range.start - 1, range.line)
          .join('\n')
          .replace(/^/gm, ' - ')
      )

      if (range.start == range.line) {
        log(
          prefix + 'Line %O of %s does not match:\n%s\n%s',
          range.start,
          log.yellow(range.file),
          actual,
          expected
        )
      } else {
        log(
          prefix + 'Lines %O-%O of %s do not match:\n%s\n%s',
          range.start,
          range.line,
          log.yellow(range.file),
          actual,
          expected
        )
      }
    })
  }
  if (count > limit) {
    log('\n' + log.lcyan(`+ ${count - limit} more`))
  }
  return failed
}
