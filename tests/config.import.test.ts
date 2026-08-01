/**
 * Dynamic import test to verify config module can be loaded.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { describe, it, expect } from 'vitest'

describe('Config Module Loading', () => {
  it('should be able to import config module', async () => {
    // Dynamic import to verify the config module structure is valid
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule).toBeDefined()
    expect(configModule.default).toBeDefined()
  })

  it('should export a config object with required properties', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    const config = configModule.default

    // Verify required VitePress config properties
    expect(config).toHaveProperty('title')
    expect(config).toHaveProperty('description')
    expect(config).toHaveProperty('themeConfig')
    expect(config).toHaveProperty('markdown')
  })

  it('should have valid title', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.title).toBe('Phlix')
  })

  it('should have valid base path', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.base).toBe('/phlix-docs/')
  })

  it('should have themeConfig with nav', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.themeConfig).toHaveProperty('nav')
    expect(Array.isArray(configModule.default.themeConfig.nav)).toBe(true)
    expect(configModule.default.themeConfig.nav.length).toBeGreaterThan(0)
  })

  it('should have themeConfig with sidebar', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.themeConfig).toHaveProperty('sidebar')
    expect(typeof configModule.default.themeConfig.sidebar).toBe('object')
  })

  it('should have themeConfig with socialLinks', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.themeConfig).toHaveProperty('socialLinks')
    expect(Array.isArray(configModule.default.themeConfig.socialLinks)).toBe(true)
  })

  it('should have themeConfig with footer', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.themeConfig).toHaveProperty('footer')
    expect(configModule.default.themeConfig.footer).toHaveProperty('message')
    expect(configModule.default.themeConfig.footer).toHaveProperty('copyright')
  })

  it('should have markdown configuration with theme', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.markdown).toHaveProperty('theme')
  })

  it('should have markdown configuration with language aliases', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.markdown).toHaveProperty('languageAlias')
    const aliases = configModule.default.markdown.languageAlias
    expect(aliases.env).toBe('dotenv')
    expect(aliases.brightscript).toBe('vb')
    expect(aliases.smarty).toBe('twig')
    expect(aliases.caddy).toBe('nginx')
  })

  it('should have cleanUrls set to false', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default).toHaveProperty('cleanUrls')
    expect(configModule.default.cleanUrls).toBe(false)
  })

  it('should have ignoreDeadLinks set to false', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default).toHaveProperty('ignoreDeadLinks')
    expect(configModule.default.ignoreDeadLinks).toBe(false)
  })

  it('should have dark mode enabled', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.themeConfig).toHaveProperty('darkModeSwitch')
    expect(configModule.default.themeConfig.darkModeSwitch).toBe(true)
  })

  it('should have local search provider', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    expect(configModule.default.themeConfig).toHaveProperty('search')
    expect(configModule.default.themeConfig.search).toHaveProperty('provider')
    expect(configModule.default.themeConfig.search.provider).toBe('local')
  })

  it('should have nav items with text and link properties', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    const navItems = configModule.default.themeConfig.nav

    for (const item of navItems) {
      expect(item).toHaveProperty('text')
      expect(item).toHaveProperty('link')
      expect(typeof item.text).toBe('string')
      expect(typeof item.link).toBe('string')
    }
  })

  it('should have valid sidebar sections', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    const sidebar = configModule.default.themeConfig.sidebar

    // Verify sidebar has expected section keys
    expect(sidebar).toHaveProperty('/install/')
    expect(sidebar).toHaveProperty('/libraries/')
    expect(sidebar).toHaveProperty('/clients/')
    expect(sidebar).toHaveProperty('/advanced/')
    expect(sidebar).toHaveProperty('/reference/')
    expect(sidebar).toHaveProperty('/dev/')
  })

  it('should have valid footer copyright', async () => {
    const configModule = await import('../docs/.vitepress/config.ts')
    const footer = configModule.default.themeConfig.footer
    expect(footer.copyright).toContain('2026')
    expect(footer.message).toBe('BSD-3-Clause')
  })
})
