// Chord 一键诊断脚本
// 用法：
//   1. 打开 chrome://extensions/
//   2. 找到 Chord 卡片 → 点「Service worker」链接（或「检查视图」→「service worker」）
//   3. 在打开的 DevTools Console 里粘贴并运行此脚本
//   4. 把输出全部截图发给我

(async () => {
  const sep = (t) => console.log('\n=== ' + t + ' ===')
  const ok = (m) => console.log('✓ ' + m)
  const fail = (m) => console.log('✗ ' + m)
  const info = (m) => console.log('· ' + m)

  // ─── 1. 验证 storage 状态 ────────────────────────────────────
  sep('Storage 状态')
  const all = await chrome.storage.local.get(null)
  info(`storage keys: ${Object.keys(all).join(', ')}`)

  const settings = all.chord_settings
  if (!settings) {
    fail('chord_settings 不存在！getSettings 首次启动应该写入。可能 storage 被清掉了')
  } else {
    info(`userId: ${settings.userId}`)
    info(`aiEngine.mode: ${settings.aiEngine?.mode}`)
    info(`aiEngine.provider: ${settings.aiEngine?.provider}`)
    info(`aiEngine.providerKeys 中有 keys: ${Object.keys(settings.aiEngine?.providerKeys ?? {}).join(', ') || '(空)'}`)
    if (settings.aiEngine?.apiKey) {
      fail('aiEngine.apiKey 在 storage 里被持久化了——不应该！putSettings 应该剥掉它')
    } else {
      ok('aiEngine.apiKey 没在 storage（正确——应该是运行时计算）')
    }
  }

  info(`chord_bundled_migrated: ${all.chord_bundled_migrated}`)

  const items = all.chord_items ?? []
  info(`items 数: ${items.length}`)
  if (items.length === 0) {
    fail('没有 items！需要重新导入书签（Onboarding 流程）')
  }

  const clusters = all.chord_clusters ?? []
  info(`clusters 数: ${clusters.length}`)
  if (clusters.length > 0) {
    const versions = new Set(clusters.map(c => c.algoVersion ?? 0))
    info(`algoVersion 分布: ${[...versions].join(', ')}`)
    if (![...versions].every(v => v === 7)) {
      fail(`存在非 v7 cluster，shouldRecluster 应该返回 true 触发重算`)
    }
    info(`cluster 名样例: ${clusters.slice(0, 5).map(c => `「${c.name}」(${c.totalCount})`).join(', ')}`)
  }

  // ─── 2. 验证 build 是否包含最新代码 ─────────────────────────
  sep('Build 状态（看动态加载的 chunk）')
  try {
    // 找到 ChromeStorageAdapter chunk 的引用——通过 dynamic import 看代码
    const adapterModule = await import(chrome.runtime.getURL('chunks/ChromeStorageAdapter-CU5jc54d.js'))
      .catch(() => null)
    if (!adapterModule) {
      info('  无法直接 import chunk（filename hash 变了？这正常）')
    }
  } catch (e) {
    info('  ' + e.message)
  }

  // ─── 3. 测试 BUNDLED_AI_KEY 是否注入 ────────────────────────
  sep('BUNDLED_AI_KEY 检测')
  // 通过 SW 全局状态推断
  if (settings?.aiEngine?.provider === 'chord_bundled' || all.chord_bundled_migrated) {
    ok('BUNDLED_AI_KEY 看起来已注入（chord_bundled_migrated=true 或 provider=chord_bundled）')
  } else {
    fail('BUNDLED_AI_KEY 似乎没注入——chord_bundled_migrated 不是 true')
    info('  → 检查 .env.local 的 VITE_CHORD_BUNDLED_AI_KEY 是否设置')
    info('  → 检查是否真的重新 build 了（pnpm -r build）')
  }

  // ─── 4. 测试 AI 接口是否可达 ────────────────────────────────
  sep('AI 接口可达性测试')
  // 我们不能直接拿到 BUNDLED_AI_KEY（已经被编译进 bundle），但能间接通过推断 + 触发一次 recluster 看
  // 调用一次最小 ping
  try {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    })
    info(`不带 Auth 的请求返回 ${res.status}（401 = 接口可达，需要 Key）`)
    if (res.status === 401) ok('智谱接口可达')
    else fail(`非预期状态码：${res.status}`)
  } catch (e) {
    fail(`网络错误：${e.message}`)
  }

  // ─── 5. 触发一次手动 recluster（如果有 items）───────────────
  if (items.length >= 15 && settings?.aiEngine) {
    sep('手动触发 recluster')
    info('开始...')
    try {
      // 通过 alarms 触发
      await chrome.alarms.create('chord_background_recluster', { when: Date.now() + 1000 })
      info('已 schedule alarm，1 秒后触发')
      info('请观察这个 console 看后续日志（[Chord] xxx）')
      info('完成后再跑一次本脚本，看 cluster 数量、名字、algoVersion 有没有变')
    } catch (e) {
      fail(e.message)
    }
  } else if (items.length < 15) {
    info(`items 只有 ${items.length} 条，不会触发 recluster（需要 ≥15）`)
  }

  sep('诊断完成')
  console.log('请把以上全部输出截图给我')
})()
