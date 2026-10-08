import { describe, expect, it } from 'vitest'

import { parseRepoSlug, resolveRepoSlug } from './repoSlug.js'
import { getClientZipUrl, getLatestReleaseApiUrl } from './repo.js'

describe('parseRepoSlug', () => {
  it('accepts owner/name', () => {
    expect(parseRepoSlug('someone/GlanceThing')).toBe('someone/GlanceThing')
  })

  it('accepts the github: shorthand', () => {
    expect(parseRepoSlug('github:someone/GlanceThing')).toBe(
      'someone/GlanceThing'
    )
  })

  it('accepts https and git urls', () => {
    expect(parseRepoSlug('https://github.com/someone/repo')).toBe(
      'someone/repo'
    )
    expect(parseRepoSlug('git+https://github.com/someone/repo.git')).toBe(
      'someone/repo'
    )
    expect(parseRepoSlug('git@github.com:someone/repo.git')).toBe(
      'someone/repo'
    )
  })

  it('rejects junk', () => {
    expect(parseRepoSlug(undefined)).toBeNull()
    expect(parseRepoSlug('')).toBeNull()
    expect(parseRepoSlug('not a slug')).toBeNull()
    expect(parseRepoSlug('https://example.com/a/b')).toBeNull()
  })
})

describe('resolveRepoSlug', () => {
  it('prefers the env override', () => {
    expect(resolveRepoSlug('a/b', 'github:c/d')).toBe('a/b')
  })

  it('falls back to the package repository field', () => {
    expect(resolveRepoSlug(undefined, 'github:c/d')).toBe('c/d')
    expect(resolveRepoSlug('', { url: 'https://github.com/c/d.git' })).toBe(
      'c/d'
    )
  })

  it('ignores an invalid override', () => {
    expect(resolveRepoSlug('nope', 'github:c/d')).toBe('c/d')
  })

  it('throws when nothing resolves', () => {
    expect(() => resolveRepoSlug(undefined, undefined)).toThrow()
  })
})

describe('release urls', () => {
  it('builds the client zip url from the slug', () => {
    expect(getClientZipUrl('0.0.16-tabs.1', 'a/b')).toBe(
      'https://github.com/a/b/releases/download/v0.0.16-tabs.1/glancething-client-v0.0.16-tabs.1.zip'
    )
  })

  it('builds the latest release api url from the slug', () => {
    expect(getLatestReleaseApiUrl('a/b')).toBe(
      'https://api.github.com/repos/a/b/releases/latest'
    )
  })
})
