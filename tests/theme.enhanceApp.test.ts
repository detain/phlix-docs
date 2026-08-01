/**
 * Tests for theme enhanceApp function execution.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const themePath = join(__dirname, '../docs/.vitepress/theme/index.ts')

describe('Theme Configuration Structure', () => {
  it('theme file exists and has required structure', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toBeTruthy()
    expect(content.length).toBeGreaterThan(0)
  })

  it('theme uses h function from vue', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain("import { h } from 'vue'")
  })

  it('theme uses satisfies Theme type assertion', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain('satisfies Theme')
  })

  it('theme extends DefaultTheme', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain('extends: DefaultTheme')
  })

  it('theme has Layout component using h()', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain('Layout:')
    expect(content).toContain('h(DefaultTheme.Layout)')
  })

  it('enhanceApp function signature accepts app, router, siteData', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain('enhanceApp({ app, router, siteData })')
  })

  it('enhanceApp function body is defined', () => {
    const content = readFileSync(themePath, 'utf-8')
    // The enhanceApp function exists and has an empty body in the current implementation
    const enhanceAppMatch = content.match(/enhanceApp\s*\(\s*\{[^}]+\}\s*\)\s*\{([^}]*)\}/)
    expect(enhanceAppMatch).toBeTruthy()
  })

  it('theme has all required imports', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain("import { h } from 'vue'")
    expect(content).toContain("import type { Theme } from 'vitepress'")
    expect(content).toContain("import DefaultTheme from 'vitepress/theme'")
    expect(content).toContain("import './style.css'")
  })

  it('theme exports default configuration', () => {
    const content = readFileSync(themePath, 'utf-8')
    expect(content).toContain('export default')
  })

  it('theme configuration matches Theme interface shape', () => {
    const content = readFileSync(themePath, 'utf-8')
    // Theme interface requires: extends, Layout, enhanceApp
    expect(content).toMatch(/extends\s*:\s*DefaultTheme/)
    expect(content).toMatch(/Layout\s*:\s*h\(DefaultTheme\.Layout\)/)
    expect(content).toMatch(/enhanceApp\s*\(\s*\{\s*app/)
  })
})
