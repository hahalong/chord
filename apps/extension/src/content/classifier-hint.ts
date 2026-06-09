// Content script: displays classification bubbles and save toasts from the service worker

let toastEl: HTMLElement | null = null
let bubbleEl: HTMLElement | null = null

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const message = msg as Record<string, unknown>
  if (message['type'] === 'SHOW_SAVE_TOAST') {
    showToast(message['message'] as string)
  }
  if (message['type'] === 'SHOW_CLASSIFICATION_BUBBLE') {
    showClassificationBubble({
      url: message['url'] as string,
      title: message['title'] as string,
      domain: message['domain'] as string,
    })
  }
  if (message['type'] === 'GET_PAGE_TEXT') {
    // Priority: OG description → meta description → h1 + first <p> of main content
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content?.trim() ?? ''
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim() ?? ''
    const h1 = Array.from(document.querySelectorAll('h1')).map(el => el.textContent?.trim()).filter(Boolean).join(' ')
    const firstP = document.querySelector('article p, main p, [role="main"] p, .content p, #content p, p')?.textContent?.trim() ?? ''
    // Prefer structured description; fall back to h1 + first paragraph (exclude if it's just the page title)
    const desc = og || meta || [h1 !== document.title.trim() ? h1 : '', firstP].filter(Boolean).join(' — ')
    sendResponse({ text: desc.slice(0, 500) })
    return true
  }
})

function showToast(text: string) {
  removeEl(toastEl)
  const el = document.createElement('div')
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:2147483647;
    background:#2A1520;color:#fff;font-family:'DM Sans',sans-serif;
    font-size:13px;padding:8px 14px;border-radius:8px;
    opacity:0;transition:opacity 200ms ease;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,.18);
  `
  el.textContent = text
  document.body.appendChild(el)
  toastEl = el
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => removeEl(el), 200)
  }, 2400)
}

function showClassificationBubble(opts: { url: string; title: string; domain: string }) {
  removeEl(bubbleEl)

  const el = document.createElement('div')
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:2147483647;
    background:#fff;border:1px solid #F0E0DF;border-radius:12px;
    padding:14px 16px;width:260px;
    font-family:'DM Sans',sans-serif;font-size:13px;color:#2A1520;
    box-shadow:0 8px 24px rgba(0,0,0,.12);
    opacity:0;transform:translateY(8px);transition:opacity 200ms ease,transform 200ms ease;
  `
  const DISMISS_MS = 4000  // 4 秒后默认归入快速入口，给用户充足阅读时间
  el.innerHTML = `
    <div style="font-size:11px;color:#7A5560;margin-bottom:6px">这个要放进候响室吗？</div>
    <div style="font-size:12px;color:#B89098;margin-bottom:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${opts.domain}</div>
    <div style="display:flex;gap:8px">
      <button id="chord-classify-content" style="flex:1;padding:6px 0;border-radius:7px;border:1px solid #D9706A;background:#FDF0EF;color:#D9706A;font-size:12px;cursor:pointer;font-family:inherit">放进书房</button>
      <button id="chord-classify-tool" style="flex:1;padding:6px 0;border-radius:7px;border:1px solid #E8D8D6;background:#fff;color:#7A5560;font-size:12px;cursor:pointer;font-family:inherit">只做入口</button>
    </div>
    <div id="chord-classify-progress" style="margin-top:10px;height:2px;background:#F0E0DF;border-radius:1px;overflow:hidden">
      <div style="width:100%;height:100%;background:#D9706A;transform-origin:left center;animation:chord-shrink ${DISMISS_MS}ms linear forwards"></div>
    </div>
    <style>@keyframes chord-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}</style>
  `
  document.body.appendChild(el)
  bubbleEl = el
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })

  const dismiss = (itemType: 'content' | 'tool') => {
    chrome.runtime.sendMessage({ type: 'USER_DOMAIN_PREF', domain: opts.domain, itemType })
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    setTimeout(() => removeEl(el), 200)
  }

  el.querySelector('#chord-classify-content')!.addEventListener('click', () => dismiss('content'))
  el.querySelector('#chord-classify-tool')!.addEventListener('click', () => dismiss('tool'))

  // 4s 超时默认归入快速入口（与进度条同步）
  setTimeout(() => { if (document.body.contains(el)) dismiss('tool') }, DISMISS_MS)
}

function removeEl(el: HTMLElement | null) {
  if (el && el.parentNode) el.parentNode.removeChild(el)
}
