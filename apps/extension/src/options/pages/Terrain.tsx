import { useEffect, useRef, useState } from 'preact/hooks'
import { signal, computed } from '@preact/signals'
import type { Cluster, AIEngineSettings, Item, SaveIntent, InterestState, ClusterUserIntent, UserActionIntent } from '@chord/types'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import { ClusterService, buildEngine, EngagementService, ClusterUserIntentService, InterestStateService, TerrainClassifier } from '@chord/core'
import type { TerrainType } from '@chord/core'

const adapter = new ChromeStorageAdapter()
const allClusters = signal<Cluster[]>([])
const allItems = signal<Item[]>([])
const visitCounts = signal<Map<string, number>>(new Map())
const userIntents = signal<ClusterUserIntent[]>([])
const loading = signal(true)
const clustering = signal(false)
const reclusterError = signal<string | null>(null)
const aiEngineSettings = signal<AIEngineSettings>({ mode: 'offline' })
const filterMode = signal<'all' | 'sleeping' | 'recent'>('all')

// 当前 hover 中的 cluster id 与画布坐标（驱动信息卡显示与位置）
const hoverInfo = signal<{ clusterId: string; x: number; y: number } | null>(null)
// 当前打开的 intent picker（点击实线气泡触发）
const intentPicker = signal<{ clusterId: string; x: number; y: number } | null>(null)

// ─── 聚合：每个 cluster 的洞察统计（saveIntent 分布、avgEngagement、dominantChip 等）

interface ClusterStats {
  cluster: Cluster
  itemCount: number
  recent30Count: number
  intentDist: Record<SaveIntent, number>   // 比例 0-1
  dominantIntent: SaveIntent | null
  aspireRatio: number
  avgEngagement: number
  engagementLevel: 'deep' | 'light' | 'zero'
  dominantChip: string | null
  isRealPassion: boolean                    // 用于决定点击行为
  /** @deprecated v3.1.29 起角标改用 terrainType；保留字段以防 hover card 等地方还引用 */
  interestState: InterestState
  /** v3.1.29 · 共享地形分类（跟 §3 隐性自我地形完全一致） */
  terrainType: TerrainType
}

const INTENT_LABELS: Record<SaveIntent, string> = {
  tool: '工具型',
  learn: '学习型',
  aspire: '渴望/身份型',
  inspire: '灵感共鸣型',
  track: '追踪情报型',
}

const ACTION_INTENT_LABELS: Record<UserActionIntent, string> = {
  writing: '写作',
  project: '项目',
  share: '分享',
  learn: '学习',
  enjoy: '欣赏',
}

/** @deprecated v3.1.29 起兴趣地图角标用 TERRAIN_LABELS_MAP；保留以防别处引用 */
const STATE_LABELS: Record<InterestState, string> = {
  emerging: '萌芽中',
  active: '活跃',
  fading: '渐退',
  dormant: '休眠',
}

/** @deprecated v3.1.29 起兴趣地图角标用 TERRAIN_COLORS */
const STATE_COLORS: Record<InterestState, string> = {
  emerging: '#9CA3D4',
  active: '#5AB870',
  fading: '#B89098',
  dormant: '#D9706A',
}

/** v3.1.29 · 兴趣地图角标新 5 状态（forest/swamp/ember/sleep/middle）
 *  跟 §3 隐性自我地形共享，永远不冲突 */
const TERRAIN_LABEL: Record<TerrainType, string> = {
  forest: '活跃',
  ember: '萌芽中',
  swamp: '积压中',
  sleep: '休眠',
  middle: '',
}

/** v3.1.29 · 角标颜色（跟旧 STATE_COLORS 保持视觉一致 + 加 swamp） */
const TERRAIN_COLOR: Record<TerrainType, string> = {
  forest: '#5AB870',   // 绿
  ember: '#9CA3D4',    // 紫
  swamp: '#B89098',    // 灰红
  sleep: '#D9706A',    // 玫瑰
  middle: '',          // 无角标
}

/** v3.1.29 · §3 隐性自我地形名（hover tooltip 引用："这是你的[名]一员") */
const TERRAIN_LABEL_PROFILE: Record<TerrainType, string> = {
  forest: '真实热情之林',
  ember: '新冒火苗',
  swamp: '焦虑沼泽',
  sleep: '沉睡之地',
  middle: '',
}

function computeClusterStats(c: Cluster, items: Item[], visits: Map<string, number>): ClusterStats {
  const ids = new Set(c.itemIds)
  const members = items.filter((i) => ids.has(i.id))
  const now = Date.now()
  const recent30Count = members.filter((i) => i.savedAt > now - 30 * 86_400_000).length

  // saveIntent 分布
  const intentDist: Record<SaveIntent, number> = { tool: 0, learn: 0, aspire: 0, inspire: 0, track: 0 }
  let intentTotal = 0
  for (const m of members) {
    if (m.saveIntent) {
      intentDist[m.saveIntent]++
      intentTotal++
    }
  }
  if (intentTotal > 0) {
    for (const k of Object.keys(intentDist) as SaveIntent[]) {
      intentDist[k] = intentDist[k] / intentTotal
    }
  }
  const dominantIntent = intentTotal > 0
    ? (Object.entries(intentDist).sort((a, b) => b[1] - a[1])[0]![0] as SaveIntent)
    : null

  // engagement
  // v0.1.2 · 注入 visitCounts · pending 但有 Chrome 真访问也给分（跟 §3 reallyUsedRate 口径对齐）
  //   修矛盾: 兴趣地图全虚线"基本未动" vs §3 显示 79% 真热情之林
  let scoreSum = 0
  let scoreCount = 0
  for (const m of members) {
    const v = visits.get(m.id) ?? 0
    const computed = EngagementService.scoreItem(m, v, now).score
    // cache 优先，但 cache 没考虑 visit；取 max 避免 cache 把 visit 加分覆盖掉
    const s = m.engagementScore != null ? Math.max(m.engagementScore, computed) : computed
    if (s > 0) { scoreSum += s; scoreCount++ }
  }
  const avgEngagement = scoreCount > 0 ? scoreSum / scoreCount : 0
  const engagementLevel: ClusterStats['engagementLevel'] =
    avgEngagement >= 60 ? 'deep' : avgEngagement >= 20 ? 'light' : 'zero'

  // dominantChip
  const chipCount: Record<string, number> = {}
  for (const m of members) {
    if (m.usageChip) chipCount[m.usageChip] = (chipCount[m.usageChip] ?? 0) + 1
  }
  const dominantChip = Object.entries(chipCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // 真实热情判定：deep + 处理率 >=0.6（与老 real_passion 阈值一致）
  const rate = c.totalCount > 0 ? c.processedCount / c.totalCount : 0
  const isRealPassion = engagementLevel === 'deep' || rate >= 0.6

  // v3.1.29 · 同时算 InterestState（向后兼容）和 TerrainType（新主信号）
  // v0.1.2 · 接通 visitCounts → §3 跟兴趣地图同源
  const terrainResult = TerrainClassifier.classifyTerrain({ items: members, visitCounts: visits, now })

  return {
    cluster: c,
    itemCount: c.totalCount,
    recent30Count,
    intentDist,
    dominantIntent,
    aspireRatio: intentDist.aspire,
    avgEngagement,
    engagementLevel,
    dominantChip,
    isRealPassion,
    interestState: InterestStateService.classifyInterestState(members),
    terrainType: terrainResult.type,
  }
}

// ─── visibleClusters: 与之前一致

const visibleClusters = computed(() => {
  const cs = allClusters.value
  if (filterMode.value === 'sleeping') {
    return cs.filter((c) => c.totalCount > 0 && c.processedCount / c.totalCount < 0.3)
  }
  if (filterMode.value === 'recent') {
    const cutoff = Date.now() - 90 * 86_400_000
    return cs.filter((c) => c.updatedAt > cutoff)
  }
  return cs
})

const visibleStats = computed<ClusterStats[]>(() =>
  visibleClusters.value.map((c) => computeClusterStats(c, allItems.value, visitCounts.value)),
)

function findUserIntent(clusterName: string): ClusterUserIntent | null {
  return userIntents.value.find((i) => i.label === clusterName) ?? null
}

// ─── Component

export function Terrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<() => void>(() => {})
  const bubblesRef = useRef<BubblePos[]>([])

  useEffect(() => {
    // 两阶段加载：
    //   Phase 1（同步快路径）：拿现成的 clusters 和 items，立刻渲染。永远不阻塞 UI。
    //   Phase 2（后台）：如果需要刷新（cluster 为空或 algoVersion 过期），在后台跑 recluster，
    //                   跑完更新 signals，画布自动重渲。clustering 信号驱动右上角的小指示器。
    async function loadPhase1() {
      loading.value = true
      try {
        const [c, s, items, intents] = await Promise.all([
          adapter.getClusters(),
          adapter.getSettings(),
          adapter.getItems({ type: ['content'] }),
          adapter.getClusterUserIntents(),
        ])
        aiEngineSettings.value = s.aiEngine
        allItems.value = items
        userIntents.value = intents
        allClusters.value = c    // 立刻渲染：即使 cluster 是旧的（algoVersion 过期）也比白屏强
        // v0.1.2 · 拉 chrome.history visit 数据让兴趣地图 engagement 跟 §3 reallyUsedRate 同源
        try {
          visitCounts.value = await ChromeStorageAdapter.getVisitCounts(items.map((i) => ({ id: i.id, url: i.url })))
        } catch (e) {
          console.warn('[Chord] Terrain getVisitCounts failed:', e)
        }
        return { c, s, items }
      } catch (e) {
        console.error('[Chord] Terrain phase 1 failed:', e)
        return null
      } finally {
        loading.value = false
      }
    }

    async function maybeRefreshInBackground(c: typeof allClusters.value, s: typeof aiEngineSettings.value, items: typeof allItems.value) {
      // 后台刷新条件：没有 cluster 或者 algoVersion 过期；并且 items 够多
      const needs = c.length === 0 || await ClusterService.shouldRecluster(adapter)
      if (!needs || items.length < 15) return
      clustering.value = true
      reclusterError.value = null
      try {
        await ClusterService.recluster(adapter, buildEngine({ ...aiEngineSettings.value }))
        allClusters.value = await adapter.getClusters()
        userIntents.value = await adapter.getClusterUserIntents()
      } catch (e) {
        const msg = (e as Error).message || String(e)
        console.warn('[Chord] Terrain background recluster failed:', e)
        reclusterError.value = msg.slice(0, 200)
        // 8 秒后自动隐藏错误提示
        setTimeout(() => { if (reclusterError.value === msg.slice(0, 200)) reclusterError.value = null }, 8000)
      } finally {
        clustering.value = false
      }
    }

    loadPhase1().then((r) => {
      if (r) maybeRefreshInBackground(r.c, r.s.aiEngine, r.items)
    })
  }, [])

  useEffect(() => {
    if (!loading.value && !clustering.value && canvasRef.current && visibleStats.value.length > 0) {
      cancelRef.current()
      const ctrl = renderBubbles(canvasRef.current, visibleStats.value)
      cancelRef.current = ctrl.cancel
      bubblesRef.current = ctrl.bubbles
    }
    return () => { cancelRef.current() }
  }, [loading.value, clustering.value, filterMode.value, allItems.value.length])

  // hit-test：找鼠标坐标下的气泡
  function hitTest(clientX: number, clientY: number): { stat: ClusterStats; cx: number; cy: number } | null {
    if (!canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    for (const b of bubblesRef.current) {
      const dx = x - b.x
      const dy = y - b.y
      if (dx * dx + dy * dy <= b.r * b.r) {
        return { stat: b.stat, cx: rect.left + b.x, cy: rect.top + b.y - b.r }
      }
    }
    return null
  }

  function onMouseMove(e: MouseEvent) {
    const hit = hitTest(e.clientX, e.clientY)
    if (hit) {
      hoverInfo.value = { clusterId: hit.stat.cluster.id, x: hit.cx, y: hit.cy }
    } else if (hoverInfo.value) {
      hoverInfo.value = null
    }
  }

  function onMouseLeave() {
    hoverInfo.value = null
  }

  function onClick(e: MouseEvent) {
    const hit = hitTest(e.clientX, e.clientY)
    if (!hit) {
      intentPicker.value = null
      return
    }
    if (hit.stat.isRealPassion) {
      intentPicker.value = { clusterId: hit.stat.cluster.id, x: hit.cx, y: hit.cy }
    } else {
      // 非真实热情气泡：点击 = 进入批量扫描该 cluster
      window.location.hash = `#process?cluster=${encodeURIComponent(hit.stat.cluster.name)}`
    }
  }

  async function forceRecluster() {
    if (clustering.value) return
    clustering.value = true
    try {
      const settings = await adapter.getSettings()
      await ClusterService.recluster(adapter, buildEngine(settings.aiEngine))
      allClusters.value = await adapter.getClusters()
      userIntents.value = await adapter.getClusterUserIntents()  // rebind 过的
    } finally {
      clustering.value = false
    }
  }

  async function setIntent(stat: ClusterStats, intent: UserActionIntent) {
    await ClusterUserIntentService.setUserIntent(adapter, {
      label: stat.cluster.name,
      topKeywords: stat.cluster.keywords ?? [],
      intent,
    })
    userIntents.value = await adapter.getClusterUserIntents()
    intentPicker.value = null
  }

  const total = allClusters.value.reduce((s, c) => s + c.totalCount, 0)
  const vis = visibleStats.value
  const hoverStat = hoverInfo.value ? vis.find((s) => s.cluster.id === hoverInfo.value!.clusterId) : null
  const pickerStat = intentPicker.value ? vis.find((s) => s.cluster.id === intentPicker.value!.clusterId) : null
  const pickerCurrentIntent = pickerStat ? findUserIntent(pickerStat.cluster.name) : null

  return (
    <div class="terrain-page">
      <CompletionToast />

      {aiEngineSettings.value.mode === 'offline' && !loading.value && allClusters.value.length > 0 && (
        <div class="terrain-ai-hint">
          当前使用离线分析，主题分类基于关键词匹配。
          <a href="#settings">配置 AI 接口 →</a> 获得真正理解内容语义的兴趣地图。
        </div>
      )}
      {reclusterError.value && (
        <div class="terrain-error-hint" style="background:#FDF0EF;border:1px solid #D9706A;border-radius:8px;padding:12px 14px;color:#9A3A35">
          <div style="font-weight:600;margin-bottom:4px">⚠️ AI 分类调用失败：{reclusterError.value}</div>
          <div style="font-size:13px;line-height:1.6">
            旧的分类结果未被覆盖（不再静默降级到本地算法）。<br/>
            常见原因：<strong>API Key 没配 / Key 失效 / 网络问题</strong>。
            请去 <a href="#settings" style="color:#D9706A;font-weight:600">Settings</a> 检查 AI 配置，
            然后回这里点「重新生成」重试。
          </div>
        </div>
      )}

      <div class="terrain-card">
        {loading.value ? (
          <div class="terrain-state-msg">加载兴趣地形…</div>
        ) : allClusters.value.length === 0 && !clustering.value ? (
          <FirstAnalysisPanel itemCount={allItems.value.length} onTrigger={forceRecluster} />
        ) : allClusters.value.length === 0 && clustering.value ? (
          <FirstAnalysisPanel itemCount={allItems.value.length} clustering onTrigger={forceRecluster} />
        ) : (
          <>
            <div class="terrain-card-hdr">
              <div class="terrain-card-titles">
                <h2 class="terrain-card-title">你在收藏什么</h2>
                <p class="terrain-card-tagline">收藏是愿望，处理是真相——这里两者都看得见</p>
              </div>
              <div class="terrain-actions">
                <button
                  class={`terrain-recluster-btn ${clustering.value ? 'terrain-recluster-loading' : ''}`}
                  onClick={forceRecluster}
                  disabled={clustering.value}
                  title="按当前内容重新分析主题"
                >
                  {clustering.value ? (
                    <><span class="trcl-dot" /><span class="trcl-dot" /><span class="trcl-dot" />后台分析中</>
                  ) : '↻ 重新生成'}
                </button>
                <div class="terrain-filters">
                  <button class={`tf-btn ${filterMode.value === 'all' ? 'tf-active' : ''}`}
                    onClick={() => { filterMode.value = 'all' }}>全部</button>
                  <button class={`tf-btn ${filterMode.value === 'sleeping' ? 'tf-active' : ''}`}
                    onClick={() => { filterMode.value = 'sleeping' }}>沉睡中</button>
                  <button class={`tf-btn ${filterMode.value === 'recent' ? 'tf-active' : ''}`}
                    onClick={() => { filterMode.value = 'recent' }}>近 3 月</button>
                </div>
              </div>
            </div>
            <div class="terrain-card-divider" />

            <div class="terrain-body">
              <div class="terrain-left">
                <p class="terrain-canvas-caption">{total} 条内容 · {allClusters.value.length} 个主题 · 泡泡越大你越"感兴趣"</p>
                {vis.length === 0 ? (
                  <div class="terrain-filter-empty">当前筛选下暂无数据</div>
                ) : (
                  <div
                    ref={wrapRef}
                    class="terrain-canvas-wrap"
                    onMouseMove={onMouseMove}
                    onMouseLeave={onMouseLeave}
                    onClick={onClick}
                  >
                    <canvas ref={canvasRef} class="terrain-canvas" />
                    <ReclusteringOverlay itemCount={total} forceShow={clustering.value} />
                  </div>
                )}
                {/* v3.1.28 · 完整图例：每个维度展开所有取值 + 解释含义 */}
                <div class="terrain-legend">
                  <div class="leg-row">
                    <div class="leg-row-key">颜色 = 主要动机</div>
                    <div class="leg-row-vals">
                      <span class="leg-chip">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="#FDF0EF" stroke="#D9706A" stroke-width="1.5"/></svg>
                        普通主题
                      </span>
                      <span class="leg-chip">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="#EEEEF8" stroke="#9CA3D4" stroke-width="1.5"/></svg>
                        渴望/身份型为主（&gt;50%「想成为这种人」）
                      </span>
                    </div>
                  </div>
                  <div class="leg-row">
                    <div class="leg-row-key">边框粗细 = 参与度</div>
                    <div class="leg-row-vals">
                      <span class="leg-chip">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#D9706A" stroke-width="2"/></svg>
                        深度（≥60 分 · 用过 / 写过笔记）
                      </span>
                      <span class="leg-chip">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#D9706A" stroke-width="1.2"/></svg>
                        轻度（20–60 分 · 处理过但浅）
                      </span>
                      <span class="leg-chip">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#D9706A" stroke-width="0.8" stroke-dasharray="2 1.5" opacity="0.6"/></svg>
                        基本未动（&lt;20 分 · 还 pending）
                      </span>
                    </div>
                  </div>
                  <div class="leg-row">
                    <div class="leg-row-key">角标 = 生命状态</div>
                    <div class="leg-row-vals">
                      {/* v3.1.29 · 角标 5 状态（删 active 兜底，改 "渐退" → "积压中" 跟 §3 焦虑沼泽对应）*/}
                      <span class="leg-chip"><span class="leg-state-dot" style="background:#5AB870" />活跃（真在用 · §3 真实热情之林）</span>
                      <span class="leg-chip"><span class="leg-state-dot" style="background:#9CA3D4" />萌芽中（最近爆发 · §3 新冒火苗）</span>
                      <span class="leg-chip"><span class="leg-state-dot" style="background:#B89098" />积压中（保存了但没用 · §3 焦虑沼泽）</span>
                      <span class="leg-chip"><span class="leg-state-dot" style="background:#D9706A" />休眠（长期无动作 · §3 沉睡之地）</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="terrain-right">
                <div class="terrain-sidebar-title">各主题状态</div>
                {vis.map((stat) => {
                  const c = stat.cluster
                  const rate = c.totalCount > 0 ? Math.round(c.processedCount / c.totalCount * 100) : 0
                  const dotCls = stat.isRealPassion ? 'ts-dot-lav' : stat.aspireRatio > 0.4 ? 'ts-dot-rose' : 'ts-dot-sky'
                  const tag = stat.isRealPassion ? '真实热情' : stat.aspireRatio > 0.4 ? '渴望落差' : '随便看看'
                  const ui = findUserIntent(c.name)
                  return (
                    <div key={c.id} class="terrain-status-row">
                      <span class={`ts-dot ${dotCls}`} />
                      <div class="ts-main">
                        <span class="ts-name">{c.name}</span>
                        <span class={`ts-tag ${stat.isRealPassion ? 'ts-tag-real' : 'ts-tag-illusion'}`}>
                          {tag}{ui && ` · ${ACTION_INTENT_LABELS[ui.intent]}`}
                        </span>
                      </div>
                      <span class="ts-count">{c.totalCount}</span>
                    </div>
                  )
                })}
                <div class="terrain-sidebar-divider" />
                <p class="terrain-sidebar-note">点击实线气泡可以告诉自己「想用它做什么」。</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Hover 信息卡（绝对定位，跟随气泡）── */}
      {hoverStat && hoverInfo.value && !intentPicker.value && (
        <HoverInfoCard stat={hoverStat} x={hoverInfo.value.x} y={hoverInfo.value.y} userIntent={findUserIntent(hoverStat.cluster.name)} />
      )}

      {/* ── 行动意图 picker（点击实线气泡）── */}
      {pickerStat && intentPicker.value && (
        <IntentPicker
          stat={pickerStat}
          x={intentPicker.value.x}
          y={intentPicker.value.y}
          current={pickerCurrentIntent}
          onPick={(intent) => setIntent(pickerStat, intent)}
          onClose={() => { intentPicker.value = null }}
        />
      )}
    </div>
  )
}

// ─── Hover 信息卡

// 首次分析进度面板：用户没 cluster 时显示
// 订阅 chord_recluster_status 显示精准 ETA；没在跑时显示「等待分析」+ 手动触发按钮
function FirstAnalysisPanel({ itemCount, clustering: showClustering, onTrigger }: { itemCount: number; clustering?: boolean; onTrigger?: () => void | Promise<void> }) {
  // v1.1.1 · bug fix: useState 替换 signal() (同 ReclusteringOverlay)
  const [status, setStatus] = useState<{ running?: boolean; totalItems?: number; estimatedSeconds?: number; startedAt?: number; lastError?: string } | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    chrome.storage.local.get('chord_recluster_status', (data) => {
      setStatus((data['chord_recluster_status'] as typeof status) ?? null)
    })
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['chord_recluster_status']) {
        setStatus(changes['chord_recluster_status'].newValue ?? null)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      chrome.storage.onChanged.removeListener(listener)
      clearInterval(interval)
    }
  }, [])

  const s = status
  const isRunning = showClustering || s?.running
  const elapsed = s?.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : 0
  const eta = s?.estimatedSeconds ?? Math.max(15, Math.round(itemCount / 50 * 5 + 10))
  const remaining = Math.max(0, eta - elapsed)

  if (itemCount < 15) {
    return (
      <div class="terrain-state-msg">
        <p>需要至少 15 条内容才能生成兴趣地形。</p>
        <p class="te-hint">继续保存内容，AI 会自动分析你的兴趣版图。</p>
      </div>
    )
  }

  if (isRunning) {
    const total = eta
    const passed = elapsed
    const pct = total > 0 ? Math.min(95, (passed / total) * 100) : 0
    return (
      <div class="first-analysis-panel">
        <div class="fap-spinner">
          <span class="fap-dot" /><span class="fap-dot" /><span class="fap-dot" />
        </div>
        <h3 class="fap-title">正在用 AI 整理你的 {itemCount} 条收藏</h3>
        <p class="fap-sub">{remaining > 0 ? `预计还需 ${remaining} 秒` : '即将完成，做最后整理…'}</p>
        <div class="fap-progress">
          <div class="fap-progress-fill" style={`width:${pct.toFixed(1)}%`} />
        </div>
        <p class="fap-tip">
          AI 在阅读每一条标题，找出共同主题。<br/>
          你可以切到其他页面继续浏览，完成后这里会自动出现。
        </p>
      </div>
    )
  }

  // 没在跑但也没 cluster：可能是刚装上没触发，或上次失败
  // v1.1.1 · 修 bug "文案说点下方按钮但其实没按钮" · 加 onTrigger 触发按钮
  return (
    <div class="first-analysis-panel">
      <h3 class="fap-title">还没生成兴趣地形</h3>
      {s?.lastError ? (
        <p class="fap-error">上次分析出错：{s.lastError}</p>
      ) : (
        <p class="fap-sub">{itemCount} 条内容已准备好（30-60 秒）</p>
      )}
      {onTrigger && (
        <button class="ob-next" style="margin-top:14px" onClick={() => { void onTrigger() }}>
          {s?.lastError ? '重试' : '开始分析'}
        </button>
      )}
    </div>
  )
}

// 重新分析覆盖层：已有旧 cluster 数据 + 正在跑新 recluster 时，盖在 canvas 上
// 让用户清楚知道「旧数据在右栏，新数据正在路上」
// 监听两个信号源：forceShow（Terrain 内部触发）+ chord_recluster_status.running（SW 后台触发）
// v1.1.1 · bug fix: useState 替换 signal()
//   旧 bug: signal() 在 component 内部调用每次 re-render 都建新 signal,
//          useEffect 闭包的 tick.value++ 改的是旧 signal, 当前渲染读的是新 signal,
//          → "已用 0 秒" 永远不涨
function ReclusteringOverlay({ itemCount, forceShow }: { itemCount: number; forceShow: boolean }) {
  const [status, setStatus] = useState<{ running?: boolean; totalItems?: number; estimatedSeconds?: number; startedAt?: number; lastError?: string } | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    chrome.storage.local.get('chord_recluster_status', (data) => {
      setStatus((data['chord_recluster_status'] as typeof status) ?? null)
    })
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['chord_recluster_status']) {
        setStatus(changes['chord_recluster_status'].newValue ?? null)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      chrome.storage.onChanged.removeListener(listener)
      clearInterval(interval)
    }
  }, [])

  const s = status
  const isRunning = forceShow || !!s?.running
  if (!isRunning) return null

  const elapsed = s?.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : 0
  const eta = s?.estimatedSeconds ?? Math.max(30, Math.round(itemCount / 50 * 5 + 30))
  const remaining = Math.max(0, eta - elapsed)
  const pct = eta > 0 ? Math.min(95, (elapsed / eta) * 100) : 0
  const stage = elapsed < 5 ? '准备数据…'
    : elapsed < eta * 0.4 ? 'AI 正在阅读每一条标题…'
    : elapsed < eta * 0.8 ? '识别共同主题…'
    : '即将完成，做最后整理…'

  return (
    <div class="terrain-overlay" role="status" aria-live="polite">
      <div class="terrain-overlay-card">
        <div class="tao-spinner">
          <span class="tao-dot" /><span class="tao-dot" /><span class="tao-dot" />
        </div>
        <h3 class="tao-title">正在重新整理你的兴趣地形</h3>
        <p class="tao-sub">{stage}</p>
        <div class="tao-progress">
          <div class="tao-progress-fill" style={`width:${pct.toFixed(1)}%`} />
        </div>
        <div class="tao-meta">
          <span>已用 {elapsed} 秒</span>
          <span class="tao-meta-sep">·</span>
          <span>{remaining > 0 ? `预计还需 ${remaining} 秒` : '即将完成'}</span>
        </div>
        <p class="tao-tip">
          完成后会自动用新分类替换。<br/>
          想看旧分类，右侧「各主题状态」列表还在。
        </p>
      </div>
    </div>
  )
}

// 完成 toast：监听 running 从 true → false 转换，显示 3 秒淡出
function CompletionToast() {
  // v1.1.1 · bug fix: useState 替换 signal() (同 ReclusteringOverlay)
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState('')
  const prevRunning = useRef<boolean>(false)

  useEffect(() => {
    chrome.storage.local.get('chord_recluster_status', (data) => {
      prevRunning.current = !!(data['chord_recluster_status'] as { running?: boolean } | undefined)?.running
    })
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (!changes['chord_recluster_status']) return
      const next = changes['chord_recluster_status'].newValue as { running?: boolean; lastError?: string; lastCompletedAt?: number } | undefined
      const nextRunning = !!next?.running
      if (prevRunning.current && !nextRunning) {
        // 刚完成
        if (next?.lastError) {
          // P1-9 · CR-046 已撤销静默 fallback；失败时保留旧分类，不降级 tfidf
          setText(`⚠️ AI 分析遇到问题：${next.lastError.slice(0, 50)}（保留了旧分类，没有降级）`)
        } else {
          const count = allClusters.value.length
          setText(`✓ 已完成 · 识别出 ${count} 个主题`)
        }
        setVisible(true)
        setTimeout(() => setVisible(false), 4000)
      }
      prevRunning.current = nextRunning
    }
    chrome.storage.onChanged.addListener(listener)
    return () => { chrome.storage.onChanged.removeListener(listener) }
  }, [])

  if (!visible) return null
  const isError = text.startsWith('⚠️')
  return (
    <div class={`terrain-toast ${isError ? 'terrain-toast-error' : 'terrain-toast-ok'}`} role="status" aria-live="polite">
      {text}
    </div>
  )
}

function HoverInfoCard({ stat, x, y, userIntent }: { stat: ClusterStats; x: number; y: number; userIntent: ClusterUserIntent | null }) {
  const c = stat.cluster
  return (
    <div class="terrain-hover-card" style={`left:${x}px;top:${y}px`}>
      <div class="thc-title">
        {c.name}
        {/* v3.1.29 · 角标 pill 改用 terrainType（跟 §3 同源），middle 状态不显示 */}
        {stat.terrainType !== 'middle' && (
          <span class="thc-state-pill" style={`background:${TERRAIN_COLOR[stat.terrainType]}`}>
            {TERRAIN_LABEL[stat.terrainType]}
          </span>
        )}
      </div>
      {/* v3.1.29 · 引导用户去 §3 看完整解读，让两 tab 互相绑定 */}
      {stat.terrainType !== 'middle' && (
        <div class="thc-terrain-hint">
          这是你的<strong>{TERRAIN_LABEL_PROFILE[stat.terrainType]}</strong>一员
          <a href="#profile" class="thc-terrain-link">去看完整解读 →</a>
        </div>
      )}
      <div class="thc-meta">{stat.itemCount} 条 · 近 30 天新增 {stat.recent30Count} 条</div>
      <div class="thc-row">
        <span class="thc-key">参与度</span>
        <span class={`thc-val thc-level-${stat.engagementLevel}`}>
          {stat.engagementLevel === 'deep' ? '深度参与' : stat.engagementLevel === 'light' ? '轻度参与' : '基本未动'}
          <span class="thc-score">（{Math.round(stat.avgEngagement)} 分）</span>
        </span>
      </div>
      {stat.dominantIntent && (
        <div class="thc-row">
          <span class="thc-key">主要动机</span>
          <span class="thc-val">{INTENT_LABELS[stat.dominantIntent]}（{Math.round(stat.intentDist[stat.dominantIntent] * 100)}%）</span>
        </div>
      )}
      {stat.dominantChip && (
        <div class="thc-row">
          <span class="thc-key">最常说</span>
          <span class="thc-val">「{stat.dominantChip}」</span>
        </div>
      )}
      {userIntent && (
        <div class="thc-userintent">
          你说过要拿它来 <strong>{ACTION_INTENT_LABELS[userIntent.intent]}</strong>
        </div>
      )}
      <div class="thc-ctas">
        <a class="thc-cta thc-cta-secondary" href={`#process?cluster=${encodeURIComponent(c.name)}`}>快速扫一遍</a>
        {stat.isRealPassion && (
          <span class="thc-cta thc-cta-primary">点击设定行动 →</span>
        )}
      </div>
    </div>
  )
}

// ─── 行动意图 picker

function IntentPicker({ stat, x, y, current, onPick, onClose }: {
  stat: ClusterStats
  x: number
  y: number
  current: ClusterUserIntent | null
  onPick: (intent: UserActionIntent) => void
  onClose: () => void
}) {
  const c = stat.cluster
  const intents: UserActionIntent[] = ['writing', 'project', 'share', 'learn', 'enjoy']
  return (
    <>
      <div class="terrain-modal-backdrop" onClick={onClose} />
      <div class="terrain-intent-picker" style={`left:${x}px;top:${y}px`}>
        <div class="tip-title">你对「{c.name}」的热情是真实的</div>
        <div class="tip-sub">想用它做什么？</div>
        <div class="tip-chips">
          {intents.map((i) => (
            <button
              key={i}
              class={`tip-chip ${current?.intent === i ? 'tip-chip-active' : ''}`}
              onClick={() => onPick(i)}
            >
              {ACTION_INTENT_LABELS[i]}
            </button>
          ))}
        </div>
        {current && (
          <div class="tip-current">当前设定：{ACTION_INTENT_LABELS[current.intent]}（点击切换）</div>
        )}
        <a class="tip-explore" href={`#process?cluster=${encodeURIComponent(c.name)}`}>看这个主题的全部内容 →</a>
        <button class="tip-close" onClick={onClose}>×</button>
      </div>
    </>
  )
}

// ─── Canvas 渲染

interface BubblePos {
  x: number
  y: number
  r: number
  stat: ClusterStats
  t: number
  baseY: number
}

interface RenderResult {
  cancel: () => void
  bubbles: BubblePos[]
}

function renderBubbles(canvas: HTMLCanvasElement, stats: ClusterStats[]): RenderResult {
  // v3.1.28 · 让 canvas 内部高度跟 CSS clamp() 同步，不再硬编码 480
  //   之前硬 480 跟 CSS viewport-relative 不匹配 → 视觉被压扁
  const W = canvas.offsetWidth || 680
  const H = canvas.offsetHeight || 520
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const maxCount = Math.max(...stats.map((s) => s.itemCount))

  // Initial elliptical placement: 椭圆环铺开（横向更宽，适配宽屏左右空间）
  // dist = 0.40 × short side（之前 0.26 太挤）；横向再 ×(W/H) 让气泡沿水平方向更分散
  const bubbles: BubblePos[] = stats.map((s, i) => {
    const r = 38 + (s.itemCount / maxCount) * 68
    const angle = (i / stats.length) * Math.PI * 2 - Math.PI / 2
    const distBase = Math.min(W, H) * 0.40
    const aspectStretch = Math.min(1.6, W / H)   // 宽屏时横向多铺开
    return {
      x: W / 2 + Math.cos(angle) * distBase * aspectStretch,
      y: H / 2 + Math.sin(angle) * distBase,
      r,
      stat: s,
      t: i * 0.85,
      baseY: 0,
    }
  })

  // Force-push overlaps
  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const bi = bubbles[i]!, bj = bubbles[j]!
        const dx = bj.x - bi.x
        const dy = bj.y - bi.y
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01
        const minD = bi.r + bj.r + 10
        if (d < minD) {
          const push = ((minD - d) / d) * 0.45
          bi.x -= dx * push; bi.y -= dy * push
          bj.x += dx * push; bj.y += dy * push
        }
      }
      const b = bubbles[i]!
      b.x = Math.max(b.r + 4, Math.min(W - b.r - 4, b.x))
      b.y = Math.max(b.r + 4, Math.min(H - b.r - 4, b.y))
    }
  }

  bubbles.forEach((b) => { b.baseY = b.y })

  let rafId = 0

  function draw() {
    ctx.clearRect(0, 0, W, H)

    for (const b of bubbles) {
      b.t += 0.012
      b.y = b.baseY + Math.sin(b.t) * 5

      const stat = b.stat
      // 视觉编码：
      //   颜色：aspire 占比 > 50% → lav（渴望型，需要警觉）；否则 → rose
      //   边框粗细：engagementLevel deep 2px / light 1.2px / zero 0.8px
      //   透明度：zero 0.6，其余 1.0
      const isAspireMajor = stat.aspireRatio > 0.5
      const borderColor = isAspireMajor ? '#9CA3D4' : '#D9706A'
      const fillColor = isAspireMajor ? '#EEEEF8' : '#FDF0EF'
      const lineWidth = stat.engagementLevel === 'deep' ? 2 : stat.engagementLevel === 'light' ? 1.2 : 0.8
      const alpha = stat.engagementLevel === 'zero' ? 0.6 : 1.0

      ctx.save()
      ctx.globalAlpha = alpha

      // Fill
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fillStyle = fillColor
      ctx.fill()

      // Border — zero 用虚线提示「还没动」
      if (stat.engagementLevel === 'zero') ctx.setLineDash([5, 4])
      else ctx.setLineDash([])
      ctx.strokeStyle = borderColor
      ctx.lineWidth = lineWidth
      ctx.stroke()

      ctx.setLineDash([])

      // Cluster name
      const nameFontSize = Math.max(12, Math.min(16, b.r / 3.2))
      const lineGap = nameFontSize * 0.75
      ctx.fillStyle = '#2A1520'
      ctx.font = `italic 500 ${nameFontSize}px 'Source Serif 4', serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(stat.cluster.name, b.x, b.y - lineGap / 2)

      // Stats line
      const rate = stat.cluster.totalCount > 0
        ? Math.round(stat.cluster.processedCount / stat.cluster.totalCount * 100)
        : 0
      const sub = `${stat.itemCount} 条 · ${rate}% 处理`
      ctx.fillStyle = borderColor
      ctx.font = `11px 'DM Mono', monospace`
      ctx.fillText(sub, b.x, b.y + lineGap)

      // v3.1.29 · 角标改用 terrainType（跟 §3 同源）。middle 状态不画角标。
      if (stat.terrainType !== 'middle') {
        const dotR = 5
        const dotOffset = b.r * 0.85
        const dotAng = -Math.PI / 4   // 右上 45°
        const dotX = b.x + Math.cos(dotAng) * dotOffset
        const dotY = b.y + Math.sin(dotAng) * dotOffset
        ctx.beginPath()
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
        ctx.fillStyle = TERRAIN_COLOR[stat.terrainType]
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      ctx.restore()
    }

    rafId = requestAnimationFrame(draw)
  }

  draw()
  return {
    cancel: () => cancelAnimationFrame(rafId),
    bubbles,
  }
}
