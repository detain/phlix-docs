/**
 * Tests for VitePress theme configuration.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const themePath = join(__dirname, '../docs/.vitepress/theme/index.ts')

describe('VitePress Theme Configuration', () => {
  it('theme file exists and is readable', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toBeTruthy()
    expect(themeContent.length).toBeGreaterThan(0)
  })

  it('theme imports from vue', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain("import { h } from 'vue'")
  })

  it('theme imports VitePress types', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain("import type { Theme } from 'vitepress'")
  })

  it('theme imports DefaultTheme', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain("import DefaultTheme from 'vitepress/theme'")
  })

  it('theme imports custom styles', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain("import './style.css'")
  })

  it('theme exports a default configuration', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain('export default')
  })

  it('theme extends DefaultTheme', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain('extends: DefaultTheme')
  })

  it('theme has Layout component', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain('Layout:')
    expect(themeContent).toContain('h(DefaultTheme.Layout)')
  })

  it('theme has enhanceApp function', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain('enhanceApp')
    expect(themeContent).toContain('app, router, siteData')
  })

  it('theme uses satisfies Theme type', () => {
    const themeContent = readFileSync(themePath, 'utf-8')
    expect(themeContent).toContain('satisfies Theme')
  })
})
