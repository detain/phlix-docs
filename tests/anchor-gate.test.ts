/**
 * Tests for the heading-anchor link gate (scripts/check-anchor-links.mjs).
 *
 * This suite exists to answer one question a green docs build cannot: is the
 * anchor gate still WIRED IN, and can it still FAIL?
 *
 * S192 measured that `ignoreDeadLinks: false` validates internal *page paths*
 * only — a bad `#anchor` (same-page or cross-page) built clean and exited 0.
 * The gate script closes that half. But a gate is only worth its runtime if
 * removing it is noticed, so the tests below run the real script against
 * synthetic fixture sites and assert both verdicts:
 *
 *   - a fixture whose anchors all resolve            -> exit 0
 *   - the same fixture with one anchor made bad      -> exit 1, names the href
 *
 * The second case is the permanent replacement for a one-off manual mutation.
 * Neuter the detection logic and it goes red here, in `npm test`, which both
 * CI jobs run before `docs:build`.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const scriptPath = join(repoRoot, 'scripts/check-anchor-links.mjs')

/** Run the gate against a fixture dist tree. Fixtures use base '/' so the run
 *  never depends on the real site config. */
function runGate(distDir: string, base = '/') {
  return spawnSync(
    process.execPath,
    [scriptPath, `--dist=${distDir}`, `--base=${base}`],
    { encoding: 'utf-8' }
  )
}

function page(body: string): string {
  return `<!DOCTYPE html><html><body>${body}</body></html>`
}

let fixtureRoot: string

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'anchor-gate-'))
})

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
})

/** Builds a fixture site. `bad` selects which link is deliberately broken. */
function buildFixture(name: string, bad: 'none' | 'same-page' | 'cross-page'): string {
  const dir = join(fixtureRoot, name)
  mkdirSync(join(dir, 'sub'), { recursive: true })

  const samePageHref = bad === 'same-page' ? '#no-such-slug' : '#local-heading'
  const crossPageHref =
    bad === 'cross-page' ? '/sub/target.html#no-such-slug' : '/sub/target.html#remote-heading'

  writeFileSync(
    join(dir, 'index.html'),
    page(
      `<h2 id="local-heading">Local heading</h2>` +
        `<a href="${samePageHref}">same page</a>` +
        `<a href="${crossPageHref}">cross page</a>` +
        `<a href="https://example.com/x#whatever">off site</a>` +
        `<a href="mailto:a@b.c">mail</a>` +
        `<a href="/sub/target.html">no fragment</a>` +
        `<a href="#">bare hash</a>`
    )
  )
  writeFileSync(
    join(dir, 'sub', 'target.html'),
    page(`<h3 id="remote-heading">Remote heading</h3><a href="#remote-heading">self</a>`)
  )
  return dir
}

describe('anchor gate — wiring', () => {
  it('is invoked by the docs:build script, so a docs build runs it', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))
    const build: string = pkg.scripts['docs:build']
    // Both halves matter: the page-path gate (vitepress) AND the anchor gate.
    expect(build).toContain('vitepress build docs')
    expect(build).toContain('scripts/check-anchor-links.mjs')
  })

  it('is reachable at the path docs:build names', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))
    const build: string = pkg.scripts['docs:build']
    const named = /(scripts\/check-anchor-links\.mjs)/.exec(build)
    expect(named).not.toBeNull()
    expect(readFileSync(join(repoRoot, named![1]), 'utf-8').length).toBeGreaterThan(0)
  })

  it('the site config still leaves page-path checking on', () => {
    // The anchor gate covers fragments only. If ignoreDeadLinks were ever
    // flipped to true, dead PAGE paths would stop failing and this suite's
    // sibling half would silently disappear.
    const cfg = readFileSync(join(repoRoot, 'docs/.vitepress/config.ts'), 'utf-8')
    expect(cfg).toContain('ignoreDeadLinks: false')
  })
})

describe('anchor gate — verdicts', () => {
  it('passes a fixture whose every anchor resolves', () => {
    const r = runGate(buildFixture('clean', 'none'))
    expect(r.stdout).toContain('0 dead anchor(s) found')
    expect(r.status).toBe(0)
  })

  it('fails a bad SAME-page anchor — the case vitepress builds clean', () => {
    const r = runGate(buildFixture('bad-same-page', 'same-page'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('#no-such-slug')
    expect(r.stderr).toContain('1 dead anchor(s) found')
  })

  it('fails a bad CROSS-page anchor — the other case vitepress builds clean', () => {
    const r = runGate(buildFixture('bad-cross-page', 'cross-page'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('/sub/target.html#no-such-slug')
    expect(r.stderr).toContain('1 dead anchor(s) found')
  })

  it('does not count off-site, fragment-less or bare-# links as anchors', () => {
    const r = runGate(buildFixture('clean-counts', 'none'))
    // 2 on-site fragment links; the https/mailto/no-fragment/bare-# ones are
    // classified, not checked. `sub/target.html` adds its own self link.
    expect(r.stdout).toMatch(/3 unique #fragment link\(s\) checked/)
    expect(r.stdout).toMatch(/2 off-site/)
    expect(r.stdout).toMatch(/1 without a fragment/)
    expect(r.stdout).toMatch(/1 bare "#" skipped/)
  })
})

describe('anchor gate — refuses to report a false zero', () => {
  it('fails when the build output directory does not exist', () => {
    const r = runGate(join(fixtureRoot, 'does-not-exist'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('cannot run')
  })

  it('fails when the build output contains no HTML at all', () => {
    const empty = join(fixtureRoot, 'empty')
    mkdirSync(empty, { recursive: true })
    const r = runGate(empty)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no .html files')
  })

  it('fails when no page contains a #fragment link — a broken scanner, not clean docs', () => {
    const noLinks = join(fixtureRoot, 'no-fragment-links')
    mkdirSync(noLinks, { recursive: true })
    writeFileSync(join(noLinks, 'index.html'), page('<h2 id="x">X</h2><a href="/other.html">y</a>'))
    const r = runGate(noLinks)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('The scanner is broken, not the docs.')
  })

  it('fails a fragment whose target page is missing from the build output', () => {
    const orphan = join(fixtureRoot, 'orphan-target')
    mkdirSync(orphan, { recursive: true })
    writeFileSync(join(orphan, 'index.html'), page('<a href="/gone.html#anything">x</a>'))
    const r = runGate(orphan)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('target page not found in build output')
  })

  it('does not treat an id shown inside a rendered code sample as a live anchor', () => {
    // In emitted HTML a code sample renders `<` as `&lt;`, so `id="…"` inside a
    // fenced block must not satisfy a link. If it did, the gate would pass
    // anchors that no element actually provides.
    const sample = join(fixtureRoot, 'code-sample-id')
    mkdirSync(sample, { recursive: true })
    writeFileSync(
      join(sample, 'index.html'),
      page('<pre><code>&lt;div id="from-a-code-sample"&gt;</code></pre>' +
        '<a href="#from-a-code-sample">x</a>')
    )
    const r = runGate(sample)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('#from-a-code-sample')
  })
})

describe('anchor gate — base resolution', () => {
  it('resolves root-absolute links through a non-default base', () => {
    const dir = join(fixtureRoot, 'based')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(
      join(dir, 'index.html'),
      page('<a href="/phlix-docs/sub/target.html#remote-heading">ok</a>' +
        '<a href="/phlix-docs/sub/target.html#nope">bad</a>')
    )
    writeFileSync(join(dir, 'sub', 'target.html'), page('<h3 id="remote-heading">R</h3>'))
    const r = runGate(dir, '/phlix-docs/')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('#nope')
    expect(r.stderr).not.toContain('#remote-heading')
    expect(r.stderr).toContain('1 dead anchor(s) found')
  })

  it('reads the real site base from config.ts when --base is not given', async () => {
    // Guards the default path the CI build actually takes: if config.ts stopped
    // exporting a usable base, every root-absolute link would fail to resolve.
    const mod = await import('../docs/.vitepress/config.ts')
    const cfg = (mod as { default?: { base?: string } }).default ?? mod
    expect(typeof (cfg as { base?: string }).base).toBe('string')
    expect((cfg as { base: string }).base.startsWith('/')).toBe(true)
    expect((cfg as { base: string }).base.endsWith('/')).toBe(true)
  })
})
