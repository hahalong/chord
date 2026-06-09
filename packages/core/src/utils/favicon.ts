export function getFaviconUrl(url: string): string {
  try {
    const { origin } = new URL(url)
    return `${origin}/favicon.ico`
  } catch {
    return ''
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
