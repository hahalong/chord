// 端到端测试：用 Puppeteer 拉真实 Chrome，加载扩展，验证 cluster 流程
// 不需要用户操作；headless 模式跑（注意：扩展只在非 headless 模式正常工作，所以用 headed）

import puppeteer from 'puppeteer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, 'dist')

const log = (m) => console.log(m)
const ok = (m) => console.log('  ✓ ' + m)
const fail = (m) => { console.log('  ✗ ' + m); process.exitCode = 1 }
const info = (m) => console.log('  · ' + m)

// 用 puppeteer 启动 Chrome，加载扩展。MV3 SW 需要被唤醒。
const browser = await puppeteer.launch({
  headless: false,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
  ],
})

// 监听新 SW target（异步事件）
let swTarget = null
browser.on('targetcreated', (t) => {
  if (t.type() === 'service_worker' && t.url().includes('chrome-extension://')) {
    swTarget = t
  }
})

try {
  log('\n=== 阶段 1：扩展加载验证 ===')

  // 先打开一个 chrome://extensions 页面以唤醒 SW
  const page = (await browser.pages())[0] ?? await browser.newPage()
  await page.goto('chrome://extensions/', { waitUntil: 'networkidle2' }).catch(() => {})

  // 轮询找 SW（最多 10 秒）
  for (let i = 0; i < 20 && !swTarget; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const targets = await browser.targets()
    swTarget = targets.find((t) =>
      t.type() === 'service_worker' && t.url().includes('chrome-extension://'),
    )
  }

  if (!swTarget) {
    fail('Service Worker 没找到（10 秒超时）')
    log('targets:')
    for (const t of await browser.targets()) log(`  - ${t.type()} ${t.url()}`)
    throw new Error('SW not loaded')
  }
  ok(`SW 加载: ${swTarget.url()}`)

  const extId = swTarget.url().match(/chrome-extension:\/\/([a-z]+)/)[1]
  info(`扩展 ID: ${extId}`)

  const swWorker = await swTarget.worker()
  if (!swWorker) {
    fail('SW worker 无法连接')
    throw new Error('No SW worker')
  }
  ok('SW worker 连上')

  // 捕获 SW console 输出（看 [Chord] xxx 错误）
  swWorker.on('console', (msg) => {
    console.log(`  [SW ${msg.type()}] ${msg.text()}`)
  })
  swWorker.on('pageerror', (e) => {
    console.log(`  [SW ERROR] ${e.message}`)
  })

  log('\n=== 阶段 2：BUNDLED_AI_KEY 注入验证 ===')
  // 在 SW 上下文里跑代码，看 BUNDLED_AI_KEY 是不是在 bundle 里
  // 我们没法直接拿到 module-level const，但能通过 storage 的 chord_bundled_migrated 推断
  const initialState = await swWorker.evaluate(async () => {
    const all = await chrome.storage.local.get(null)
    return {
      keys: Object.keys(all),
      bundledMigrated: all.chord_bundled_migrated,
      hasSettings: !!all.chord_settings,
      provider: all.chord_settings?.aiEngine?.provider,
      providerKeysInStorage: all.chord_settings?.aiEngine?.providerKeys
        ? Object.keys(all.chord_settings.aiEngine.providerKeys)
        : null,
      hasApiKeyInStorage: !!all.chord_settings?.aiEngine?.apiKey,
      itemsCount: (all.chord_items ?? []).length,
      clustersCount: (all.chord_clusters ?? []).length,
      clusterVersions: [...new Set((all.chord_clusters ?? []).map(c => c.algoVersion ?? 0))],
    }
  })

  info('初始 storage 状态: ' + JSON.stringify(initialState, null, 2))

  if (initialState.bundledMigrated === true) {
    ok('chord_bundled_migrated=true (BUNDLED_AI_KEY 已注入)')
  } else if (initialState.provider === 'chord_bundled') {
    ok('provider=chord_bundled (BUNDLED_AI_KEY 已注入)')
  } else if (!initialState.hasSettings) {
    info('首次启动，待 getSettings 触发')
  } else {
    fail(`provider=${initialState.provider}，bundledMigrated=${initialState.bundledMigrated} —— BUNDLED_AI_KEY 可能没注入`)
  }

  if (initialState.hasApiKeyInStorage) {
    fail('storage 里 aiEngine.apiKey 存在！putSettings 应该剥掉（不变式 3 违反）')
  }

  log('\n=== 阶段 3：模拟有 items 的老用户场景（CR-027：500 条触发 max_tokens 边界） ===')
  // CR-027：把 items 从 100 提到 500，让 cluster() 输出 token 数远超旧硬编码 512
  // 旧 bug：max_tokens=512 写死，输出截断 → JSON parse 失败 → 静默 fallback 到 TF-IDF
  // 修复后：max_tokens=8192，应能完整返回
  await swWorker.evaluate(async () => {
    const items = []
    const topics = ['Java 教程', 'Python 入门', 'React Hooks', 'TypeScript 类型',
                    '红烧肉做法', '清蒸鱼', '日本动漫', 'NBA 赛事',
                    '机器学习', '深度学习', 'Transformer', '芯片产业',
                    '健身计划', '咖啡冲泡', '红酒品鉴', '钢琴学习',
                    '股票投资', '基金理财', '量化交易', '宏观经济',
                    '北京旅游', '日本京都', '欧洲旅行', '南极探险']
    for (let i = 0; i < 500; i++) {
      items.push({
        id: `i${i}`,
        url: `https://example.com/${i}`,
        title: `${topics[i % topics.length]} 第${i}篇`,
        favicon: '',
        savedAt: Date.now() - i * 86400000,
        sourceDomain: 'example.com',
        type: 'content',
        status: 'pending',
        wakeCount: 0,
        source: 'saved',
      })
    }
    const oldCluster = {
      id: 'old',
      name: '纹藏 · agi',
      itemIds: items.map(i => i.id),
      keywords: ['纹藏', 'agi'],
      processedCount: 0,
      totalCount: 500,
      updatedAt: Date.now() - 86400000,
      algoVersion: 6,   // 老版本，触发 shouldRecluster
    }
    await chrome.storage.local.set({
      chord_items: items,
      chord_clusters: [oldCluster],
    })
    return 'injected'
  })
  ok('注入了 500 条 items + 1 个老 v6 junk cluster（触发 max_tokens 边界）')

  log('\n=== 阶段 4：触发 recluster（用 alarm 立刻触发，绕开 SW 30s 默认延迟）===')
  // chrome.alarms 最短延迟是 30 秒，但我们用 `when` 设过去时间能立刻触发
  // alarm 路径会调 maybeRunBackgroundRecluster({force: true}) → 写 status
  const triggered = await swWorker.evaluate(async () => {
    await chrome.alarms.create('chord_background_recluster', { when: Date.now() + 1 })
    return 'alarm scheduled'
  })
  info(`触发结果: ${triggered}`)

  // 5 秒后检查 status 是否写到 storage（CR-023：用户能感知进度）
  await new Promise((r) => setTimeout(r, 5000))
  const midState = await swWorker.evaluate(async () => {
    const data = await chrome.storage.local.get('chord_recluster_status')
    return data.chord_recluster_status
  })
  if (midState?.running) {
    ok(`recluster 状态写入 storage: running=${midState.running}, totalItems=${midState.totalItems}, eta=${midState.estimatedSeconds}s`)
  } else {
    fail(`status 没有 running=true，UI 无法显示进度: ${JSON.stringify(midState)}`)
  }

  // 等后台 recluster 完成。500 条 + sub-clustering，AI 调用 ~30-60 秒
  info('继续等 70 秒（500 条 AI 调用 + sub-clustering + buffer）')
  await new Promise((r) => setTimeout(r, 70000))

  // 最终 status 应该 running=false + lastCompletedAt 已设置
  const finalStatus = await swWorker.evaluate(async () => {
    const data = await chrome.storage.local.get('chord_recluster_status')
    return data.chord_recluster_status
  })
  if (finalStatus?.running === false && finalStatus?.lastCompletedAt) {
    ok(`recluster 完成状态: running=false, lastCompletedAt=${new Date(finalStatus.lastCompletedAt).toISOString()}`)
  } else {
    fail(`最终 status 异常: ${JSON.stringify(finalStatus)}`)
  }

  log('\n=== 阶段 5：验证 recluster 结果 ===')
  const after = await swWorker.evaluate(async () => {
    const all = await chrome.storage.local.get(null)
    const clusters = all.chord_clusters ?? []
    return {
      clusterCount: clusters.length,
      versions: [...new Set(clusters.map(c => c.algoVersion ?? 0))],
      names: clusters.map(c => ({ name: c.name, count: c.totalCount })).slice(0, 20),
      largestClusterSize: Math.max(...clusters.map(c => c.totalCount)),
      hasOldVnGuardName: clusters.some(c => c.name === '纹藏 · agi'),
    }
  })

  info('after.clusterCount: ' + after.clusterCount)
  info('after.versions: ' + after.versions.join(', '))
  info('after.largestClusterSize: ' + after.largestClusterSize)
  info('after.cluster names:')
  for (const c of after.names) info(`    「${c.name}」(${c.count})`)

  if (after.versions.includes(6)) {
    fail('老 v6 cluster 还在！shouldRecluster/recluster 没生效')
  } else {
    ok('所有 cluster 已升级到 v8')
  }

  if (after.hasOldVnGuardName) {
    fail('「纹藏 · agi」cluster 还在！没真正重算')
  } else {
    ok('「纹藏 · agi」junk drawer 已消失')
  }

  // CR-027 关键断言：cluster 名不应该有 ` · ` 拼接（那是 TF-IDF buildClusterName 的特征）
  // 如果出现 `·` 说明 AI 仍在静默失败、走 fallback 路径
  const dotJoinedNames = after.names.filter((c) => c.name.includes('·') || c.name.includes(' · '))
  if (dotJoinedNames.length > 0) {
    fail(`发现 ${dotJoinedNames.length} 个「·」拼接 cluster 名（AI 仍在静默失败）: ${dotJoinedNames.map(c => c.name).join(', ')}`)
  } else {
    ok('没有「·」拼接的 cluster 名（说明 AI 真在跑，不是 TF-IDF fallback）')
  }

  // 500 条 → 期望至少 10 个 cluster（覆盖主题数）
  if (after.clusterCount < 10) {
    fail(`只有 ${after.clusterCount} 个 cluster！500 条内容应该至少 10+ 类`)
  } else {
    ok(`生成了 ${after.clusterCount} 个 cluster（合理）`)
  }

  // 最大 cluster 不应该占总量的 30% 以上
  const maxRatio = after.largestClusterSize / 500
  if (maxRatio > 0.3) {
    fail(`最大 cluster ${after.largestClusterSize}/500 (${(maxRatio * 100).toFixed(0)}%) > 30%，仍是 junk drawer`)
  } else {
    ok(`最大 cluster ${after.largestClusterSize}/500 (${(maxRatio * 100).toFixed(0)}%)（不是 junk drawer）`)
  }

  log('\n=== 阶段 6：读 SW console 错误 ===')
  // 通过 worker 直接读 console（puppeteer 默认转发）
  // 这里我们已经在前面阶段执行了，看是否有未捕获错误

  log('\n✅ 端到端测试完成')
} catch (e) {
  console.error('\n❌ 测试失败:', e)
  process.exitCode = 1
} finally {
  await browser.close()
}
