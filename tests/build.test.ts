/**
 * Tests for build output validation.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distPath = join(__dirname, '../docs/.vitepress/dist')

describe('Build Output Validation', () => {
  beforeAll(() => {
    // Ensure we're testing after a build
    expect(existsSync(distPath)).toBe(true)
  })

  it('dist directory exists', () => {
    expect(existsSync(distPath)).toBe(true)
  })

  it('index.html exists', () => {
    const indexPath = join(distPath, 'index.html')
    expect(existsSync(indexPath)).toBe(true)
    const content = readFileSync(indexPath, 'utf-8')
    expect(content).toContain('Phlix')
  })

  it('404.html exists', () => {
    const notFoundPath = join(distPath, '404.html')
    expect(existsSync(notFoundPath)).toBe(true)
  })

  it('assets directory exists', () => {
    const assetsPath = join(distPath, 'assets')
    expect(existsSync(assetsPath)).toBe(true)
    const assets = readdirSync(assetsPath)
    expect(assets.length).toBeGreaterThan(0)
  })

  it('hashmap.json exists and is valid', () => {
    const hashmapPath = join(distPath, 'hashmap.json')
    expect(existsSync(hashmapPath)).toBe(true)
    const content = readFileSync(hashmapPath, 'utf-8')
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('generated pages for major documentation sections', () => {
    const sections = [
      'install',
      'libraries',
      'clients',
      'advanced',
      'reference',
      'dev',
      'hub-admin',
      'hub',
      'security',
      'admin',
      'integrations',
      'faq'
    ]
    sections.forEach(section => {
      const sectionPath = join(distPath, section)
      // Either as a directory with index.html or as a direct .html file
      const hasDirectory = existsSync(sectionPath) && statSync(sectionPath).isDirectory()
      const hasFile = existsSync(join(distPath, `${section}.html`))
      expect(hasDirectory || hasFile).toBe(true)
    })
  })

  it('vp-icons.css exists', () => {
    const cssPath = join(distPath, 'vp-icons.css')
    expect(existsSync(cssPath)).toBe(true)
  })

  it('no broken HTML files (all HTML files are non-empty)', () => {
    const htmlFiles: string[] = []

    function walkDir(dir: string) {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const fullPath = join(dir, entry)
        const stat = statSync(fullPath)
        if (stat.isDirectory() && entry !== 'assets') {
          walkDir(fullPath)
        } else if (entry.endsWith('.html')) {
          htmlFiles.push(fullPath)
        }
      }
    }

    walkDir(distPath)

    expect(htmlFiles.length).toBeGreaterThan(5)

    htmlFiles.forEach(file => {
      const content = readFileSync(file, 'utf-8')
      expect(content.length).toBeGreaterThan(100, `${file} seems too small or empty`)
    })
  })
})
