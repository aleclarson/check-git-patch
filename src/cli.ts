import slurm from 'slurm'
import { check } from './check'
import { existsSync } from 'fs-extra'

export function run() {
  const [file] = slurm()
  if (!file || !existsSync(file)) {
    console.log('💥  Patch does not exist: %O', file)
    process.exit(1)
  }
  const conflicts = check(file)
  if (conflicts.length) {
    conflicts.forEach(conflict => {
      const prefix = '💥  '
      if (conflict.line == null) {
        console.log(prefix + 'File does not exist: %O', conflict.file)
      } else {
        console.log(
          prefix + 'Line %O in %O is conflicted',
          conflict.line,
          conflict.file
        )
      }
    })
  } else {
    console.log('✨  No conflicts found.')
  }
}
