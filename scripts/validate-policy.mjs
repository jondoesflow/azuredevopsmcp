#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function fail(message) {
  console.error(`\nPolicy validation failed: ${message}`)
  process.exit(1)
}

function ensureFile(path) {
  if (!existsSync(path)) fail(`Missing required file: ${path.replace(root + '\\', '')}`)
}

function ensureTextIncludes(text, required, fileLabel) {
  for (const value of required) {
    if (!text.includes(value)) {
      fail(`${fileLabel} must include: ${value}`)
    }
  }
}

const copilotPath = resolve(root, '.github', 'copilot-instructions.md')
const instructionPaths = [
  resolve(root, '.github', 'instructions', 'frontend.instructions.md'),
  resolve(root, '.github', 'instructions', 'backend.instructions.md'),
  resolve(root, '.github', 'instructions', 'docs.instructions.md'),
  resolve(root, '.github', 'instructions', 'bdd-tests.instructions.md'),
]

ensureFile(copilotPath)
instructionPaths.forEach(ensureFile)

const copilotText = readFileSync(copilotPath, 'utf8')
ensureTextIncludes(
  copilotText,
  [
    '## Scope and precedence',
    '## Project methodologies',
    '## Quality policy',
    '## Standards references',
    'windsurfrules.md',
    'docs/engineering/code-review-guidelines.md',
    'docs/engineering/pull-request-guidelines.md',
  ],
  '.github/copilot-instructions.md',
)

for (const p of instructionPaths) {
  const text = readFileSync(p, 'utf8')
  if (text.trim().length < 80) {
    fail(`Instruction file appears too short: ${p.replace(root + '\\', '')}`)
  }
}

console.log('Policy validation passed.')
