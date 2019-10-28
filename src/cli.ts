import slurm from 'slurm'
import chalk from 'chalk'
import { check } from './check'
import { existsSync, readFileSync } from 'fs-extra'

const prefix = '\n💥  '

export function run() {
  let failed = false
  slurm().forEach(patchFile => {
    if (!existsSync(patchFile)) {
      console.log(prefix + 'Patch does not exist: %s', chalk.yellow(patchFile))
      return (failed = true)
    }

    const { conflicts } = check(patchFile)
    if (!conflicts.length) return
    failed = true

    // We want the first conflict in a file to be printed last,
    // since developers typically work from the top down.
    conflicts.reverse()

    type Range = { file: string; start: number; line: number; text: string }
    const ranges: Range[] = []

    let range: Range | undefined
    conflicts.forEach(({ file, dest, line, text = '', error }) => {
      if (error) {
        console.log(
          prefix + 'Diff for line %O of %s is corrupted:\n%s',
          line,
          chalk.yellow(file),
          chalk.red(error)
        )
      } else if (dest) {
        console.log(
          prefix + 'Rename failed. File already exists:',
          chalk.yellow(dest)
        )
      } else if (line == null) {
        console.log(prefix + 'File does not exist:', chalk.yellow(file))
      } else {
        if (range && file == range.file && line == range.start - 1) {
          range.text = text + '\n' + range.text
          range.start--
        } else {
          range = { file, start: line, line, text }
          ranges.push(range)
        }
      }
    })

    ranges.forEach(range => {
      const lines = readFileSync(range.file, 'utf8').split(/\r?\n/)

      const expected = chalk.green(range.text.replace(/^/gm, ' + '))
      const actual = chalk.red(
        lines
          .slice(range.start - 1, range.line)
          .join('\n')
          .replace(/^/gm, ' - ')
      )

      if (range.start == range.line) {
        console.log(
          prefix + 'Line %O of %s does not match:\n%s\n%s',
          range.start,
          chalk.yellow(range.file),
          actual,
          expected
        )
      } else {
        console.log(
          prefix + 'Lines %O-%O of %s do not match:\n%s\n%s',
          range.start,
          range.line,
          chalk.yellow(range.file),
          actual,
          expected
        )
      }
    })
  })

  if (failed) {
    process.exit(1)
  } else {
    console.log('\n✨  No conflicts found.')
  }
}
