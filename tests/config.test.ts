/**
 * Tests for VitePress site configuration.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const configPath = join(__dirname, '../docs/.vitepress/config.ts')

describe('VitePress Configuration', () => {
  it('config file exists and is readable', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toBeTruthy()
    expect(configContent.length).toBeGreaterThan(0)
  })

  it('config contains required VitePress imports', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("import { defineConfig } from 'vitepress'")
  })

  it('config exports a default configuration', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('export default defineConfig')
  })

  it('config has valid site title', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("title: 'Phlix'")
  })

  it('config has valid description', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('description:')
    expect(configContent).toContain('Phlix Media Server')
  })

  it('config has base path set correctly', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("base: '/phlix-docs/'")
  })

  it('config has themeConfig with navigation', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('themeConfig')
    expect(configContent).toContain('nav:')
    expect(configContent).toContain('Install')
    expect(configContent).toContain('FAQ')
    expect(configContent).toContain('Get Started')
  })

  it('config has sidebar configuration', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('sidebar:')
  })

  it('config has social links with github', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('socialLinks:')
    expect(configContent).toContain('github')
    expect(configContent).toContain('https://github.com/detain/phlix-docs')
  })

  it('config has footer configuration', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('footer:')
    expect(configContent).toContain('BSD-3-Clause')
  })

  it('config has dark mode switch enabled', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('darkModeSwitch: true')
  })

  it('config has local search provider', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('search:')
    expect(configContent).toContain("provider: 'local'")
  })

  it('config has markdown configuration with theme', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('markdown:')
    expect(configContent).toContain('github-light')
    expect(configContent).toContain('github-dark')
  })

  it('config has language aliases for syntax highlighting', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('languageAlias:')
    expect(configContent).toContain('env:')
    expect(configContent).toContain('dotenv')
    expect(configContent).toContain('brightscript:')
    expect(configContent).toContain('smarty:')
    expect(configContent).toContain('caddy:')
  })

  it('config has cleanUrls disabled', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('cleanUrls: false')
  })

  it('config has ignoreDeadLinks set to false', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('ignoreDeadLinks: false')
  })

  it('nav contains expected menu items', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    const navItems = [
      'Install',
      'FAQ',
      'Get Started',
      'Libraries',
      'Clients',
      'Advanced',
      'Developers',
      'Reference',
      'Integrations',
      'Security',
      'Admin',
      'Hub Admin'
    ]
    navItems.forEach(item => {
      expect(configContent).toContain(`text: '${item}'`)
    })
  })

  it('sidebar has installation section with linux link', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/install/'")
    expect(configContent).toContain("text: 'Installation'")
    expect(configContent).toContain("text: 'Linux'")
    expect(configContent).toContain("link: '/install/linux'")
  })

  it('sidebar has libraries section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/libraries/'")
    expect(configContent).toContain("text: 'Libraries'")
    expect(configContent).toContain("text: 'Movies'")
    expect(configContent).toContain("text: 'TV Shows'")
    expect(configContent).toContain("text: 'Music'")
  })

  it('sidebar has clients section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/clients/'")
    expect(configContent).toContain("text: 'Clients'")
    expect(configContent).toContain("text: 'Mobile'")
    expect(configContent).toContain("text: 'Web App'")
  })

  it('sidebar has advanced section with hardware transcoding', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/advanced/'")
    expect(configContent).toContain("text: 'Advanced'")
    expect(configContent).toContain("text: 'Hardware Transcoding'")
    expect(configContent).toContain("text: 'Live TV & DVR'")
  })

  it('sidebar has reference section with environment variables', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/reference/'")
    expect(configContent).toContain("text: 'Reference'")
    expect(configContent).toContain("text: 'Environment Variables'")
    expect(configContent).toContain("text: 'Config Files'")
    expect(configContent).toContain("text: 'CLI'")
  })

  it('sidebar has dev section with architecture docs', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/dev/'")
    expect(configContent).toContain("text: 'Architecture'")
    expect(configContent).toContain("text: 'Server Architecture'")
    expect(configContent).toContain("text: 'Plugin SDK'")
  })

  it('sidebar has hub-admin section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/hub-admin/'")
    expect(configContent).toContain("text: 'Hub Admin'")
    expect(configContent).toContain("text: 'Overview'")
    expect(configContent).toContain("text: 'Admin Console'")
  })

  it('sidebar has hub section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/hub/'")
    expect(configContent).toContain("text: 'Hub'")
    expect(configContent).toContain("text: 'What is the Hub'")
    expect(configContent).toContain("text: 'Relay Internals'")
  })

  it('sidebar has integrations section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/integrations/'")
    expect(configContent).toContain("text: 'Integrations'")
    expect(configContent).toContain("text: 'Last.fm Scrobbling'")
  })

  it('sidebar has security section with passkeys', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/security/'")
    expect(configContent).toContain("text: 'Security'")
    expect(configContent).toContain("text: 'Passkeys'")
    expect(configContent).toContain("text: 'SSO")
  })

  it('sidebar has admin section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/admin/'")
    expect(configContent).toContain("text: 'Server Admin'")
    expect(configContent).toContain("text: 'Webhooks'")
    expect(configContent).toContain("text: 'User Management'")
  })

  it('sidebar has troubleshooting section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/troubleshooting'")
    expect(configContent).toContain("text: 'Troubleshooting'")
  })

  it('sidebar has privacy-security section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/privacy-security'")
    expect(configContent).toContain("text: 'Privacy & Security'")
  })

  it('sidebar has faq section', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain("'/faq'")
    expect(configContent).toContain("text: 'FAQ'")
  })

  it('all nav links are properly formatted', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    const navLinkRegex = /\{ text: '[^']+', link: '[^']+' \}/g
    const matches = configContent.match(navLinkRegex)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThan(0)
  })

  it('head includes favicon configuration', () => {
    const configContent = readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('head:')
    expect(configContent).toContain('rel:')
    expect(configContent).toContain('icon')
  })
})
