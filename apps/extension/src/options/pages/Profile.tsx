/**
 * Profile · 隐性自我 v2 · 6 段对话式架构
 *
 * 6 段结构（详见 设计稿/Profile_变体E_融合版_隐性自我.html）：
 *   §1 你是谁 · 三维身份卡（消费 / 心境 / 半径）
 *   §2 但有件事让我意外 · 数据反差句子（DramaticInsightService）
 *   §3 你的地形 · 隐喻地形（焦虑沼泽 / 真实热情之林 / 新冒火苗 / 沉睡之地）
 *   §4 你正在变成另一个人 · 时间线 SVG
 *   §5 为什么会这样 · 心理引导（Week 3 加 PsychGuidanceService）
 *   §6 AI 反直觉发现 · 现有 AI Headline 升级版
 *
 * 文案纪律（plan §二·补）：活人感、温柔反讽、不评判、不学术装腔
 */

import { useEffect, useState, useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import type * as preact from 'preact'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import {
  AnalyticsService,
  AIInsightsService,
  IdentityService,
  BehavioralChangeService,
  DramaticInsightService,
  PsychGuidanceService,
  buildEngine,
} from '@chord/core'
import type { DramaticInsight, PsychGuidance, ChangeSignal } from '@chord/core'
import type {
  Finding,
  InsightFeedback,
  IdentityCard,
  IdentityDimension,
  Item,
  Experiment,
} from '@chord/types'

const adapter = new ChromeStorageAdapter()

const items = signal<Item[]>([])
const aiHeadline = signal<Finding | null>(null)
const aiHeadlineLoading = signal(false)
const findings = signal<Finding[]>([])
const identityCards = signal<IdentityCard[]>([])
const dramaticInsights = signal<DramaticInsight[]>([])
const psychGuidance = signal<PsychGuidance | null>(null)
const loading = signal(true)
// 渐进展开：默认只显第 1 段，点"继续 ↓"展开下一段
const revealedCount = signal(1)
const feedbackByKey = signal<Map<string, InsightFeedback['rating']>>(new Map())
// v3.1.28 · 分享卡 Modal 开关（取消"复制配套文案"功能——让用户看到卡后自己写一句）
const showShareCard = signal(false)

// §1 当前激活的维度（点 thumb 切换主卡）
const activeDim = signal<IdentityDimension>('consumption')

const FEEDBACK_STORAGE_KEY = 'chord_insights_feedback'

export function Profile() {
  useEffect(() => {
    load()
  }, [])

  async function load() {
    loading.value = true
    const allItems = await adapter.getItems({ type: ['content'] })
    items.value = allItems
    const visitCounts = await ChromeStorageAdapter.getVisitCounts(
      allItems.map((i) => ({ id: i.id, url: i.url })),
    )
    // v3.1.25 · 先算 identityCards 再算 findings——让 §3 能拿 consumptionId 做"不一致硬约束"
    //   （如 MINIMALIST 用户 §3 不该有焦虑沼泽）
    // v0.1.4 · 滞后区: 读上次身份缓存传给 computeAllIdentities, 临界值小波动时保留 prev
    let prevCards: IdentityCard[] | undefined
    try {
      const cached = await new Promise<{ chord_identity_cache?: { at: number; cards: IdentityCard[] } }>((resolve) => {
        chrome.storage.local.get('chord_identity_cache', (d) => resolve(d as any))
      })
      const c = cached.chord_identity_cache
      // 缓存 7 天内有效, 超过认为可能数据有大变化, 跳过滞后区
      if (c && Array.isArray(c.cards) && Date.now() - c.at < 7 * 86_400_000) {
        prevCards = c.cards
      }
    } catch { /* 首次没缓存, 走原路径 */ }
    identityCards.value = IdentityService.computeAllIdentities(allItems, visitCounts, undefined, prevCards)
    // 写回缓存让下次加载用
    chrome.storage.local.set({ chord_identity_cache: { at: Date.now(), cards: identityCards.value } }).catch(() => {})
    const consumptionCard = identityCards.value.find((c) => c.dimension === 'consumption')
    findings.value = await AnalyticsService.computeInsights(adapter, visitCounts, consumptionCard?.id)
    // v3.1.14 · 传 consumptionId 给 §2，让 §2 按身份跳冲突 template
    dramaticInsights.value = DramaticInsightService.generateDramaticInsights({
      items: allItems,
      visitCounts,
      consumptionId: consumptionCard?.id,
    })
    psychGuidance.value = PsychGuidanceService.generateGuidance({
      cards: identityCards.value,
      items: allItems,
      visitCounts,
    })
    // 主卡默认设为第一张（通常是 consumption）
    if (identityCards.value.length > 0) {
      activeDim.value = identityCards.value[0]!.dimension
    }
    loading.value = false

    const fbData = await chrome.storage.local.get(FEEDBACK_STORAGE_KEY)
    const allFeedback = (fbData[FEEDBACK_STORAGE_KEY] as InsightFeedback[] | undefined) ?? []
    const map = new Map<string, InsightFeedback['rating']>()
    for (const fb of allFeedback) map.set(fb.feedbackKey, fb.rating)
    feedbackByKey.value = map

    aiHeadlineLoading.value = true
    try {
      const settings = await adapter.getSettings()
      const engine = buildEngine(settings.aiEngine)
      const recentFeedback = allFeedback.slice(-10)
      // v3.1.28 · 反馈闭环 ① · 读 §1-§5 反馈喂 AI prompt
      const sectionFbData = await chrome.storage.local.get(SECTION_FEEDBACK_KEY)
      const sectionFeedbackForAI = ((sectionFbData[SECTION_FEEDBACK_KEY] as SectionFeedback[] | undefined) ?? [])
        .filter((f) => f.rating !== null || (f.customText && f.customText.length > 0))
        .slice(-30)
        .map((f) => ({
          sectionKey: f.sectionKey,
          rating: (f.rating ?? 'partial') as 'accurate' | 'partial' | 'not_accurate',
          context: f.contextHash,
          customText: f.customText,
        }))
      // v3.1.11 · 给 AI Headline 传身份 context → 避免 §6 跟 §1 人设冲突
      // v3.1.24 · 扩展加 mindset/radius——避免 §6 跟 §1 当下行为矛盾（如 RETURNER 翻老收藏 vs AI 说"开新方向"）
      const cards = identityCards.value
      const consumption = cards.find((c) => c.dimension === 'consumption')
      const mindset = cards.find((c) => c.dimension === 'mindset')
      const radius = cards.find((c) => c.dimension === 'radius')
      const identityHint = cards.length > 0 ? {
        comboCode: IdentityService.getComboCode(cards),
        comboName: deriveComboName(cards) || undefined,
        consumptionId: consumption?.id,
        consumptionClaim: consumption?.claim,
        mindsetId: mindset?.id,
        mindsetClaim: mindset?.claim,
        radiusId: radius?.id,
        radiusClaim: radius?.claim,
      } : undefined

      // v3.1.25 · §5 AI 化（千人千面）+ §6 AI Headline 并行调用
      //   §5 模板版本已经在上面 sync 渲染好——AI 成功就无缝替换，失败就保持模板版本
      const dramaticInsightTexts = dramaticInsights.value.slice(0, 3).map((d) => d.text)
      const headlinePromise = AIInsightsService.generateAIHeadline(adapter, engine, {
        visitCounts,
        feedbackHistory: recentFeedback,
        sectionFeedback: sectionFeedbackForAI,
        identityHint,
      })
      const guidanceAIPromise = PsychGuidanceService.generateGuidanceAI(engine, {
        cards,
        items: allItems,
        visitCounts,
        dramaticInsightTexts,
        sectionFeedback: sectionFeedbackForAI,
      })

      const [headline, aiGuidance] = await Promise.all([headlinePromise, guidanceAIPromise])
      aiHeadline.value = headline
      if (aiGuidance) {
        // AI 成功 → 替换模板版本
        psychGuidance.value = aiGuidance
      }
      // AI 失败 / 无 key / engine 不支持 → 保留之前 sync 渲染的模板版本
    } catch (e) {
      console.warn('[Chord] AI section load failed:', e)
    } finally {
      aiHeadlineLoading.value = false
    }
  }

  async function submitFeedback(finding: Finding, rating: InsightFeedback['rating']) {
    if (!finding.feedbackKey) return
    const fbData = await chrome.storage.local.get(FEEDBACK_STORAGE_KEY)
    const all = (fbData[FEEDBACK_STORAGE_KEY] as InsightFeedback[] | undefined) ?? []
    const newEntry: InsightFeedback = {
      feedbackKey: finding.feedbackKey,
      rating,
      claim: finding.claim,
      at: Date.now(),
    }
    const idx = all.findIndex((f) => f.feedbackKey === finding.feedbackKey)
    if (idx >= 0) all[idx] = newEntry
    else all.push(newEntry)
    const trimmed = all.slice(-100)
    await chrome.storage.local.set({ [FEEDBACK_STORAGE_KEY]: trimmed })
    const newMap = new Map(feedbackByKey.value)
    newMap.set(finding.feedbackKey, rating)
    feedbackByKey.value = newMap
  }

  if (loading.value) return <div class="profile-loading">生成隐性自我中…</div>

  const cards = identityCards.value
  const insights = dramaticInsights.value
  const fs = findings.value
  const comboName = deriveComboName(cards)

  // 构建可用段列表（跳过没数据的段，编号连续）
  const segments: { key: string; node: preact.ComponentChildren }[] = []
  if (cards.length > 0) {
    segments.push({
      key: 'identity',
      node: <IdentitySection cards={cards} active={activeDim.value} comboName={comboName}
        onSwitch={(d) => { activeDim.value = d }}
        onShare={() => { showShareCard.value = true }} />,
    })
  }
  if (insights.length > 0) {
    segments.push({ key: 'insight', node: <InsightSection insights={insights.slice(0, 2)} /> })
  }
  if (hasTerrainData(fs)) {
    segments.push({ key: 'terrain', node: <TerrainSection findings={fs} /> })
  }
  if (items.value.length >= 5) {
    segments.push({ key: 'timeline', node: <TimelineSection items={items.value} /> })
  }
  if (psychGuidance.value) {
    segments.push({ key: 'guidance', node: <GuidanceSection guidance={psychGuidance.value} /> })
  }
  // v1.1.4 · 用户试过的实验时间线（有历史才显示）
  segments.push({ key: 'experiment-history', node: <ExperimentHistorySection /> })
  // v3.1.13 · §6 永远渲染——AI 失败/未配置/loading 中也给一个占位卡，避免"消失"困惑
  if (aiHeadline.value) {
    segments.push({
      key: 'headline',
      node: <HeadlineSection finding={aiHeadline.value}
        feedback={feedbackByKey.value.get(aiHeadline.value.feedbackKey ?? '') ?? null}
        onFeedback={(r) => submitFeedback(aiHeadline.value!, r)} />,
    })
  } else {
    // v3.1.25 · 传 consumptionId + itemCount 让 placeholder 按身份分支文案
    const consumptionForPlaceholder = cards.find((c) => c.dimension === 'consumption')
    segments.push({
      key: 'headline-placeholder',
      node: <HeadlinePlaceholder
        loading={aiHeadlineLoading.value}
        consumptionId={consumptionForPlaceholder?.id}
        itemCount={items.value.length}
      />,
    })
  }

  // v3.1.28 · 渐进引导 vs 自由滚动并存
  //   - 所有段始终 render（用户可自由滚动）
  //   - "继续 ↓"按钮：scroll 到下一段（不再锁后续 DOM）
  //   - 进度计数 N/M 仍显示当前 focused 段（用 revealedCount 维护）
  const shown = Math.min(revealedCount.value, segments.length)
  const allRevealed = shown >= segments.length

  function revealNext() {
    if (shown >= segments.length) return
    revealedCount.value = shown + 1
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-seg="${segments[shown]?.key}"]`)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div class="profile-page">
      {segments.map((seg, i) => (
        <div key={seg.key} data-seg={seg.key} class={`seg-wrapper ${i === shown - 1 && i > 0 ? 'seg-just-revealed' : ''}`}>
          {seg.node}
          {/* 段尾"继续 ↓"按钮 —— 仅当前 focused 段且后面还有时显示 */}
          {i === shown - 1 && !allRevealed && (
            <div class="seg-next">
              <button class="seg-next-btn" onClick={revealNext}>
                继续 ↓
              </button>
              <span class="seg-progress">{shown} / {segments.length}</span>
            </div>
          )}
        </div>
      ))}

      {/* v3.1.28 · 分享按钮 —— 跟 revealedCount 解耦：用户自由滚到底也能看到（之前要求点完"继续"按钮才出现，bug）*/}
      {segments.length > 0 && (
        <div class="seg-end-actions">
          <button class="end-btn" onClick={() => { showShareCard.value = true }}>
            让懂我的人看见 →
          </button>
        </div>
      )}
      {showShareCard.value && (
        <ShareCardModal
          cards={cards}
          comboName={comboName}
          items={items.value}
          onClose={() => { showShareCard.value = false }} />
      )}

      {aiHeadlineLoading.value && !aiHeadline.value && allRevealed && (
        <div class="ai-headline-loading">
          <span class="ahl-dot" /><span class="ahl-dot" /><span class="ahl-dot" />
          <span class="ahl-text">AI 正在找一个反直觉的发现…</span>
        </div>
      )}

      {/* v3.1.25 · Chord Triad 释义 · 不显眼的底部 footer，默认折叠 */}
      {allRevealed && segments.length > 0 && <ChordTriadFooter />}
    </div>
  )
}

// ─── Chord Triad 释义 footer ──────────────────────────────

function ChordTriadFooter() {
  // v1.1.1 · bug fix: useState 替换 signal() — component 内部 signal 每次 render 都新建, 状态丢失
  const [open, setOpen] = useState(false)
  return (
    <details class="triad-footer" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary class="triad-summary">
        <span class="triad-mark">♪</span>
        <span>关于 <strong>Chord Triad</strong> · 三和弦自我</span>
        <span class="triad-toggle">{open ? '收起' : '展开'}</span>
      </summary>
      <div class="triad-body">
        <p>
          音乐里，<strong>三和弦（Triad）</strong>是和弦最基础的形态——三个音叠在一起，
          就能唤起一种独立的情绪色彩。
        </p>
        <p>
          Chord 把你的隐性自我画成一个三和弦：
        </p>
        <ul class="triad-axes">
          <li><strong>消费风格</strong>（Consumption） · <em>你跟内容的底色</em></li>
          <li><strong>心境</strong>（Mindset） · <em>你这阵子的情绪 / 动作</em></li>
          <li><strong>注意力半径</strong>（Radius） · <em>你视野张开的范围</em></li>
        </ul>
        <p>
          你保存的每条内容是一个<em>单音</em>——AI 听出你最常奏的那个三和弦，
          那是你的<strong>隐性自我</strong>。26 种三和弦各有自己的画像和质感，
          它们不是给你贴的标签，是你这段日子的"主音"。
        </p>
        <p class="triad-foot-note">
          三和弦会随着你保存的内容慢慢变化——同一个你，不同的乐章。
        </p>
      </div>
    </details>
  )
}

/** §3 是否有可显示的地形数据
 *  v3.1.29 · 主推 terrain_* 新 type；旧 type 后向兼容（如 storage 老反馈 / 老版渲染）*/
function hasTerrainData(findings: Finding[]): boolean {
  return findings.some((f) =>
    f.type === 'terrain_forest' || f.type === 'terrain_swamp' ||
    f.type === 'terrain_ember' || f.type === 'terrain_sleep' ||
    // 后向兼容旧 type
    f.type === 'anxiety_panorama' || f.type === 'illusion_anxiety' ||
    f.type === 'real_passion' || f.type === 'hidden_strength' ||
    f.type === 'momentum_rising' || f.type === 'momentum_falling',
  )
}

// ─── §1 三维身份卡 ──────────────────────────────────────

function IdentitySection({
  cards,
  active,
  comboName,
  onSwitch,
  onShare,
}: {
  cards: IdentityCard[]
  active: IdentityDimension
  comboName: string
  onSwitch: (d: IdentityDimension) => void
  onShare?: () => void
}) {
  const dimLabel: Record<IdentityDimension, string> = {
    consumption: '消费风格',
    mindset: '心境',
    radius: '半径',
  }
  const dimSub: Record<IdentityDimension, string> = {
    consumption: '你怎么对待保存的东西',
    mindset: '你最近的状态',
    radius: '你的注意力有多广',
  }
  const imgPath = (id: string) => `/assets/identity-art/chatgpt/${id.toUpperCase()}.png`

  // 完整 3 维度位置（缺失的用 null 占位）
  const dimOrder: IdentityDimension[] = ['consumption', 'mindset', 'radius']
  const byDim = new Map(cards.map((c) => [c.dimension, c]))
  // v3.1.10 · active 维度直接生效（含空维度）—— 让用户点击"还看不清"chip 时主卡切到 UNSEEN 视觉
  // 之前 fallback 会把空维度跳回非空，导致点击没效果
  const mainDim = active
  const mainCard = byDim.get(mainDim) ?? null
  const others = dimOrder.filter((d) => d !== mainDim)

  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 1 段 · 你是谁</div>
        {/* v3.1.28 · 右上角小分享图标 —— 跟整体玫瑰线条视觉一致 */}
        {onShare && (
          <button class="seg-share-btn" onClick={onShare} title="生成分享卡">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="2.5"/>
              <circle cx="6" cy="12" r="2.5"/>
              <circle cx="18" cy="19" r="2.5"/>
              <line x1="8.2" y1="10.8" x2="15.8" y2="6.2"/>
              <line x1="8.2" y1="13.2" x2="15.8" y2="17.8"/>
            </svg>
          </button>
        )}
      </div>
      <div class="bubble bubble-hero">
        <div class="deck-area">
          <div class="deck-wrap">
            {/* v3.1.1 · 三卡布局：副卡-左 / 主卡-中 / 副卡-右（flex 横向居中）*/}
            <BgCard dim={others[0]!} card={byDim.get(others[0]!) ?? null} position={2} dimLabel={dimLabel} imgPath={imgPath} onSwitch={onSwitch} />
            {/* 主卡：有则展示，无则占位 ·  key 强制切换维度时重新挂载，触发 card-main-enter 动画 */}
            {mainCard ? (
              <div class="card-main" key={`main-${mainDim}`}>
                <div class="card-main-img">
                  <img src={imgPath(mainCard.id)} alt={mainCard.enName} />
                </div>
                <div class="card-main-body">
                  <div>
                    {/* v3.1 · 去掉"· 主"——主卡视觉本身已表达"主"含义 */}
                    <div class="card-dim">{dimLabel[mainCard.dimension]}</div>
                    <div class="card-dim-sub">{dimSub[mainCard.dimension]}</div>
                    <div class="card-id-en">{mainCard.enName}</div>
                    <div class="card-id-zh">{mainCard.name}</div>
                    <div class="card-claim">"{mainCard.claim}"</div>
                  </div>
                  <div class="card-evi">{mainCard.evidence}</div>
                </div>
              </div>
            ) : (
              <div class="card-main card-main-empty" key={`main-empty-${mainDim}`}>
                {/* v3.1.7 · 主卡缺数据态加左侧 UNSEEN 图 + 右侧解释 */}
                <div class="card-main-img">
                  <img src={`/assets/identity-art/chatgpt/${UNSEEN_IMG[mainDim]}.png`}
                       alt={`${dimLabel[mainDim]} · 还看不清`} />
                </div>
                <div class="card-main-body">
                  <div>
                    <div class="card-dim">{dimLabel[mainDim]}</div>
                    <div class="card-dim-sub">{dimSub[mainDim]}</div>
                    <div class="card-id-zh" style="font-size:22px;margin-top:14px">还看不清</div>
                    <div class="card-empty-what">{EMPTY_EXPLAIN[mainDim].what}</div>
                  </div>
                  <div class="card-empty-how">{EMPTY_EXPLAIN[mainDim].how}</div>
                </div>
              </div>
            )}
            <BgCard dim={others[1]!} card={byDim.get(others[1]!) ?? null} position={3} dimLabel={dimLabel} imgPath={imgPath} onSwitch={onSwitch} />
          </div>
          <div class="deck-thumbs">
            {dimOrder.map((d) => {
              const has = byDim.has(d)
              return (
                <button
                  key={d}
                  class={`deck-thumb ${mainDim === d ? 'active' : ''} ${!has ? 'deck-thumb-empty' : ''}`}
                  onClick={() => onSwitch(d)}
                  title={has ? '' : '该维度数据不足'}
                >
                  {/* v3.1.6 · 缺数据态从"数据不足"改成"还看不清" */}
                  {dimLabel[d]}{!has ? ' · 还看不清' : ''}
                </button>
              )
            })}
          </div>
        </div>
        {/* v3.1.6 · 综合句：MBTI 风格大字 code + 中文全称 + 叙述 */}
        {cards.length > 0 && (() => {
          const narrative = comboNarrative(cards)
          if (!narrative) return null
          const code = IdentityService.getComboCode(cards)
          return (
            <div class="combined-summary">
              <div class="combo-code-row">
                <code class="combo-code" title="Chord Triad · 你的三和弦自我（消费 · 心境 · 半径）。下方有完整释义。">{code}</code>
                {comboName && <strong class="combo-name">{comboName}</strong>}
              </div>
              <div class="combo-narrative">{narrative}</div>
            </div>
          )
        })()}
      </div>
      <PlaceholderChips sectionKey="identity" contextHash={IdentityService.getComboCode(cards) || 'identity-empty'} />
    </section>
  )
}

function BgCard({
  dim,
  card,
  position,
  dimLabel,
  imgPath,
  onSwitch,
}: {
  dim: IdentityDimension
  card: IdentityCard | null
  position: 2 | 3
  dimLabel: Record<IdentityDimension, string>
  imgPath: (id: string) => string
  onSwitch?: (d: IdentityDimension) => void
}) {
  // 点击副卡 → 切换到主卡（即使该维度无数据也允许切，让缺数据态展示出来）
  const handleClick = onSwitch ? () => onSwitch(dim) : undefined
  if (card) {
    return (
      <div class={`card-bg bg-${position}`} onClick={handleClick} role="button" tabIndex={0}>
        <div class="bg-mini">
          <div class="bg-mini-img"><img src={imgPath(card.id)} alt={card.enName} /></div>
          <div class="bg-mini-text">
            <div class="bg-dim">{dimLabel[card.dimension]}</div>
            <div class="bg-id-en">{card.enName}</div>
            <div class="bg-id-zh">{card.name}</div>
          </div>
        </div>
      </div>
    )
  }
  // v3.1.6 · 缺数据态从"数据不足"改成"还看不清 + 多看几天"温柔邀请
  // v3.1.7 · 加 UNSEEN_X 图替换 ◌ 圆圈占位（雾中朦胧背影 / 晨雾小径 / 未画完地图）
  const unseenImg = `/assets/identity-art/chatgpt/${UNSEEN_IMG[dim]}.png`
  return (
    <div class={`card-bg bg-${position} card-bg-empty`} onClick={handleClick} role="button" tabIndex={0}
         title="点击展开看这一维度还需要什么">
      <div class="bg-mini">
        <div class="bg-mini-img bg-mini-img-empty">
          <img src={unseenImg} alt={`${dimLabel[dim]} · 还看不清`} />
        </div>
        <div class="bg-mini-text">
          <div class="bg-dim">{dimLabel[dim]}</div>
          <div class="bg-id-zh bg-empty-title">还看不清</div>
          <div class="bg-empty-hint">{EMPTY_HINT_SHORT[dim]}</div>
        </div>
      </div>
    </div>
  )
}

// v3.1.7 · 三维度对应的"未显形"图
const UNSEEN_IMG: Record<IdentityDimension, string> = {
  consumption: 'UNSEEN_CONSUMPTION',
  mindset: 'UNSEEN_MINDSET',
  radius: 'UNSEEN_RADIUS',
}

// v3.1.6 · 缺数据态文案（副卡 1 行 / 主卡完整版）
const EMPTY_HINT_SHORT: Record<IdentityDimension, string> = {
  consumption: '处理几条让我看见',
  mindset: '多看几天再来',
  radius: '看你保存的方向',
}

const EMPTY_EXPLAIN: Record<IdentityDimension, { what: string; how: string }> = {
  consumption: {
    what: '消费风格看你怎么对待保存的内容——读、标记、放手。',
    how: '处理几条收藏后，这一面会自己亮起来。',
  },
  mindset: {
    what: '心境看你最近 30-90 天的节奏——保存量增减、主题在变还是在沉。',
    how: '数据再积累几天，这一面会自己亮起来。',
  },
  radius: {
    what: '半径看你 90 天里的注意力分布——专注还是分散。',
    how: '让数据再多一些，或保存几个不同方向，这一面就能看见。',
  },
}

// ─── §2 数据反差 ────────────────────────────────────────

function InsightSection({ insights }: { insights: DramaticInsight[] }) {
  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 2 段 · 但有件事让我意外</div>
      </div>
      <div class="bubble">
        <div class="b-eyebrow">数字反差</div>
        <div class="b-text">
          {insights.map((insight, i) => (
            <div key={i} style={i > 0 ? 'margin-top:16px' : ''}>
              <div>{highlightNumbers(insight.text)}</div>
              {/* v3.1.20 · identityHook 优先于 quiet；带角度 tag（一致加深 / 反差反转）*/}
              {insight.identityHook ? (
                <span class={'quiet quiet-hook quiet-hook-' + (insight.surpriseAngle ?? 'neutral')}>
                  {insight.surpriseAngle === 'consistent_extreme' && <em class="hook-tag">果然如此 · </em>}
                  {insight.surpriseAngle === 'contrast' && <em class="hook-tag">出乎意料 · </em>}
                  {insight.identityHook}
                </span>
              ) : insight.quiet ? (
                <span class="quiet">{insight.quiet}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <PlaceholderChips sectionKey="insight" contextHash={insights.map((i) => (i.text ?? '').slice(0, 24)).join('|') || 'insight-empty'} />
    </section>
  )
}

/** 用 <strong> 把句子里的数字、百分比、cluster 名（「...」）做高亮 */
function highlightNumbers(text: string): preact.ComponentChildren {
  // 匹配：数字 + 单位（条/天/月前/%）/ 占比百分号 / 「...」cluster 名
  const parts: preact.ComponentChildren[] = []
  const regex = /(\d+(?:\.\d+)?\s*(?:条|个月前|%|天前|次)?|「[^」]+」)/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    parts.push(<strong>{m[0]}</strong>)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts
}

// ─── §3 隐喻地形 ────────────────────────────────────────

function TerrainSection({ findings }: { findings: Finding[] }) {
  // 焦虑沼泽 = illusion_anxiety + anxiety_panorama
  // v3.1.29 · 共享 TerrainClassifier 输出 4 个 terrain_* finding（每个 cluster 单选 score 最高）
  //   后向兼容：旧 finding type 仍接住，service 不再 emit 它们但 chrome.storage 老数据可能有
  const swamp = findings.find((f) => f.type === 'terrain_swamp')
    ?? findings.find((f) => f.type === 'anxiety_panorama')
    ?? findings.find((f) => f.type === 'illusion_anxiety')
  const forest = findings.find((f) => f.type === 'terrain_forest')
    ?? findings.find((f) => f.type === 'real_passion')
    ?? findings.find((f) => f.type === 'hidden_strength')
  const ember = findings.find((f) => f.type === 'terrain_ember')
    ?? findings.find((f) => f.type === 'momentum_rising')
  const sleep = findings.find((f) => f.type === 'terrain_sleep')
    ?? findings.find((f) => f.type === 'momentum_falling')
    ?? findings.find((f) => f.type === 'long_wait')

  if (!swamp && !forest && !ember && !sleep) return null

  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 3 段 · 你的地形</div>
      </div>
      <div class="bubble bubble-terrain">
        <div class="b-eyebrow">地形俯瞰 · 主题分四块</div>
        <div class="b-text" style="font-size:15px;margin-bottom:8px">书房不是一个房间，是一片地形。这是你的：</div>
        {/* v3.1.28-2 · 4 槽始终显示——空槽显示 placeholder，让"地形 4 维度"的结构感始终在 */}
        <div class="terrain-grid">
          <TerrainSlot
            label="焦虑沼泽" colorClass="swamp" labelClass="terr-swamp"
            finding={swamp}
            emptyHint="暂无 · 你保存的主题都还真在用，没有积压焦虑。"
          />
          <TerrainSlot
            label="真实热情之林" colorClass="forest" labelClass="terr-forest"
            finding={forest}
            emptyHint="还看不见 · 多用一阵 Chord，处理过的内容多一些，真实热情就会浮出来。"
          />
          <TerrainSlot
            label="新冒火苗" colorClass="ember" labelClass="terr-ember"
            finding={ember}
            emptyHint="暂无 · 最近没有主题在加速涌现。"
          />
          <TerrainSlot
            label="沉睡之地" colorClass="sleep" labelClass="terr-sleep"
            finding={sleep}
            emptyHint="暂无 · 没有主题在远离你。所有方向都还在呼吸。"
          />
        </div>
        {/* v3.1.17 · 地图解读 —— 不只是画地形，给出"形状"的意义 + 一个反思方向 */}
        <div class="terrain-reading">
          <div class="b-eyebrow">地图怎么读</div>
          <div class="terr-reading-text">{terrainInterpretation(swamp, forest, ember, sleep)}</div>
          <div class="terr-reading-prompt" dangerouslySetInnerHTML={{ __html: terrainPrompt(swamp, forest, ember, sleep) }} />
        </div>
      </div>
      <PlaceholderChips sectionKey="terrain" contextHash={[swamp, forest, ember, sleep].map((f) => f?.cluster ?? f?.type ?? '').filter(Boolean).join('|') || 'terrain-empty'} />
    </section>
  )
}

/** v3.1.28-2 · 4 槽位 cell 组件——空槽显示 placeholder 保持地形结构感 */
function TerrainSlot({ label, colorClass, labelClass, finding, emptyHint }: {
  label: string
  colorClass: string
  labelClass: string
  finding: Finding | undefined
  emptyHint: string
}) {
  if (finding) {
    return (
      <div class={`terr-card ${colorClass}`}>
        <div class={`terr-label ${labelClass}`}><span class="dot"></span>{label}</div>
        <div class="terr-title">{terrainTitle(finding)}</div>
        <div class="terr-detail">{finding.metricText}</div>
        <div class="terr-note">{finding.evidence}</div>
      </div>
    )
  }
  return (
    <div class={`terr-card ${colorClass} terr-card-empty`}>
      <div class={`terr-label ${labelClass}`}><span class="dot"></span>{label}</div>
      <div class="terr-empty-hint">{emptyHint}</div>
    </div>
  )
}

/**
 * v3.1.17 · 根据地形成分综合解读
 * - forest 主导 → 健康画像
 * - swamp 主导 → 值得反思
 * - 两者并存 → 承认双面性
 * - 只有 ember → 早期形态
 * - 只有 sleep → 曾经的你
 */
function terrainInterpretation(
  swamp: Finding | undefined,
  forest: Finding | undefined,
  ember: Finding | undefined,
  sleep: Finding | undefined,
): string {
  if (forest && !swamp && !sleep) {
    // v3.1.24 "消化了" 改成直白动作（"翻看过 / 用过"），不让用户停下来猜含义
    return '你的地形以真实热情之林为主——保存的内容你大多真的翻看过、用过了。这是一种少见的清醒：知道自己要什么，不囤未来。'
  }
  if (swamp && !forest && !sleep) {
    return '你的地形以焦虑沼泽为主——存的多，处理的少。这不丢人，是大部分人的地形。但值得看见：这些主题里，哪些是你真心想做的，哪些是别人觉得你该做的？'
  }
  if (forest && swamp && !sleep) {
    return '你的地形里既有真实热情之林也有焦虑沼泽——同一个人，既有真在做的事，也有想做但还没做的事。这很正常。先看清两者的边界，再决定哪个值得花更多时间。'
  }
  if (sleep && !forest && !swamp) {
    return '你的地形以沉睡之地为主——这些主题曾是你在意的，但你已经不是当时的你了。地图没在催你回去；只是提醒你它们在那。'
  }
  if (forest && sleep && !swamp) {
    return '你的地形里热情之林跟沉睡之地共存——你深入做了一些事，也放下了一些事。这是个有过去也有当下的人的地形。'
  }
  if (swamp && sleep && !forest) {
    return '你的地形里焦虑沼泽连着沉睡之地——存了又没看，看了又放下了。这阵子可能是在用"存"来安慰自己，而不是真的想消化。'
  }
  if (ember && !forest && !swamp && !sleep) {
    return '你的地形里只有新冒火苗——你最近在开新方向，旧的画像还看不清。给它一点时间，让风把火带去它要去的地方。'
  }
  if (forest && swamp && sleep) {
    return '你的地形是完整的——真实热情、焦虑沼泽、沉睡之地三者并存。这是个用 Chord 一段时间的人的地形，每一块都是你曾经或正在的一部分。'
  }
  return '你的地形还在显形——再保存几条，地图会慢慢长出来。'
}

/**
 * v3.1.24 · 反思 prompt 重写
 * 旧版 5 个都是"可以想一想：[抽象问题]"——故作玄机，用户读完不知道要做什么。
 * 新版改成 3 分钟内可立刻做完的具体小练习：明确动作 + 明确产出 + 不抽象。
 */
function terrainPrompt(
  swamp: Finding | undefined,
  forest: Finding | undefined,
  _ember: Finding | undefined,
  sleep: Finding | undefined,
): string {
  if (forest && !swamp) {
    return '<strong>挑 1 条你最近翻看过的</strong>，给它写一行私注：「我为什么会一次次回到这里？」——一句话就够，你会看见这些主题背后藏着同一个你。'
  }
  if (swamp && !forest) {
    return '<strong>打开焦虑沼泽里最大的那块主题，看 3 条最老的</strong>——逐条问自己：「这是我想做的，还是别人觉得我该做的？」不是的就放手。'
  }
  if (forest && swamp) {
    return '<strong>从焦虑沼泽里挑 3 条最老的</strong>，问自己：「如果今天才看见它，我还会保存吗？」——不会的，就放手；剩下的，挪到你的热情之林。'
  }
  if (sleep) {
    return '<strong>打开沉睡之地里 1 条最老的</strong>，做一件事：要么直接放手，要么给它写一行私注「今天的我为什么还需要它」。两种选择都算前进。'
  }
  return '<strong>接下来一周，每存一条问自己一句</strong>：「我准备拿它做什么？」——能答上来再存，答不上来就跳过。地图会自己长出来。'
}

/**
 * 地形卡标题：
 * - anxiety_panorama（多 cluster 合并）→ 列具体主题名「A · B · C」
 * - 单 cluster finding → 直接用 cluster 名
 * - 都没有 → fallback 到 claim
 */
function terrainTitle(f: Finding): string {
  if (f.panoramaRows && f.panoramaRows.length > 0) {
    const names = f.panoramaRows.map((r) => r.cluster)
    // 最多列 3 个，余下用 + N 显示
    if (names.length <= 3) return names.join(' · ')
    return names.slice(0, 3).join(' · ') + ` +${names.length - 3}`
  }
  return f.cluster ?? f.claim
}

// ─── §4 时间线 SVG ──────────────────────────────────────

function TimelineSection({ items }: { items: Item[] }) {
  // 算 4-6 个主要 cluster 在过去 90 天的保存量分布（按周聚合）
  // 简化版：取保存量 top 4 cluster，每条曲线显示其周保存量随时间的变化
  const DAY = 86_400_000
  const now = Date.now()
  const startTs = now - 90 * DAY
  const recent = items.filter((i) => i.savedAt >= startTs && i.cluster)
  if (recent.length < 5) return null

  // cluster 总量排序，取 top 4
  const counts = new Map<string, number>()
  for (const i of recent) counts.set(i.cluster!, (counts.get(i.cluster!) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  if (top.length < 2) return null

  // 每个 cluster 算 9 个 10 天 bucket 的累计保存数（end 在每个 bucket 末）
  const buckets = 9
  const curves: { cluster: string; series: number[]; total: number }[] = []
  for (const [cluster, total] of top) {
    const series = new Array(buckets).fill(0)
    for (const i of recent) {
      if (i.cluster !== cluster) continue
      const daysAgo = (now - i.savedAt) / DAY
      const bucketIdx = Math.min(buckets - 1, Math.floor((90 - daysAgo) / 10))
      if (bucketIdx >= 0) series[bucketIdx]++
    }
    curves.push({ cluster, series, total })
  }

  // 算势能：最近 30 天 vs 60-90 天
  function trendOf(c: { series: number[]; total: number }) {
    const recent3 = c.series.slice(6).reduce((s, n) => s + n, 0)
    const prev6 = c.series.slice(0, 3).reduce((s, n) => s + n, 0)
    if (recent3 > prev6 * 1.5) return 'rising'
    if (recent3 < prev6 * 0.4) return 'falling'
    return 'flat'
  }

  // 转 SVG path (viewBox 880x240) · v3.1.28 视觉升级
  //   原：直线 polyline + 等高 → 锯齿感、平淡
  //   新：Catmull-Rom 平滑曲线 + 中轴 baseline（曲线穿过中轴，rising 在上方 / falling 在下方）
  const W = 880, H = 240, PAD_L = 40, PAD_R = 30, PAD_T = 28, PAD_B = 36
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const baselineY = PAD_T + innerH / 2     // 中轴在画布中央
  const upRange = innerH / 2 - 6           // 上方半幅
  const downRange = innerH / 2 - 6         // 下方半幅
  // 算每条曲线的"中心值"作 baseline 偏移基准（让曲线起伏围绕该 cluster 的历史均值）
  const maxY = Math.max(1, ...curves.flatMap((c) => c.series))
  // points 数组（按 bucket 给出 [x, y]）
  function pointsOf(series: number[]): Array<[number, number]> {
    return series.map((y, i) => {
      const x = PAD_L + (i / (buckets - 1)) * innerW
      // 归一化到 [0, 1]，再以 0.5 为基线、上下展开
      const norm = y / maxY        // 0 ~ 1
      const offset = norm - 0.4    // 把 baseline 从 0.5 下移到 0.4，让中位数偏下→大数往上突
      const yPos = baselineY - offset * (offset > 0 ? upRange * 2 : downRange * 2)
      return [x, yPos] as [number, number]
    })
  }
  // Catmull-Rom → SVG cubic Bézier
  function pathOf(series: number[]): string {
    const pts = pointsOf(series)
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M ${pts[0]![0]} ${pts[0]![1]}`
    let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const p3 = pts[i + 2] ?? p2
      // Catmull-Rom → Bézier 控制点（tension = 0.5）
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    }
    return d
  }
  // 末端点（用于画 pulsing dot + 标签）
  function endPointOf(series: number[]): [number, number] {
    const pts = pointsOf(series)
    return pts[pts.length - 1] ?? [PAD_L + innerW, baselineY]
  }

  // 每条曲线一个独立颜色（按 cluster 顺序），用 hue 大跨度的 4 色（绿/蓝/玫瑰/金）
  // —— 之前是按 trend 共用 3 色，导致多条同 trend 的曲线全是绿色分不清
  // trend 仅影响：falling 用虚线 + 末端淡化
  const CURVE_COLORS = ['#7AC890', '#A8C8E0', '#D9706A', '#C9A86A']
  const colorOf = (i: number) => CURVE_COLORS[i % CURVE_COLORS.length]!

  // v3.1.2 · 多维度变化检测（topic_migration + process_rate + chip_shift + stability）
  //   - 段标题 = top 1 信号的 title
  //   - 主叙述 = top 1 信号的 narrative
  //   - 补充观察 = top 2-3 信号的 narrative（如果有的话）
  const allSignals = BehavioralChangeService.detectChanges({ items })
  // 主信号没有时，回退到老叙述路径
  const topSignal = allSignals[0]
  const sectionTitle = topSignal?.title ?? '你的几个主题最近在平稳推进'
  const primaryNarrative = topSignal?.narrative ?? '你的几个主题节奏都很稳。'
  // 补充观察：跳过 #1，只列 #2/#3
  const supportSignals = allSignals.slice(1, 3).filter((s) => s.magnitude >= 0.25)

  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 4 段 · {sectionTitle}</div>
      </div>
      <div class="bubble bubble-timeline">
        <div class="b-eyebrow">过去 90 天 · 收藏轨迹</div>
        <div class="tl-wrap">
          {/* v3.1.28 视觉升级：平滑曲线 + 中轴 + ▲涨势/▼退潮 标签 + "现在"竖线 + 末端 pulsing dot */}
          <div class="tl-axis-up">▲ 涨势</div>
          <div class="tl-axis-dn">▼ 退潮</div>
          <svg class="tl-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <defs>
              {/* Preact 用 dash-case，不是 React 驼峰；之前 stopColor 没生效导致曲线 fallback 黑色 */}
              {curves.map((_, i) => {
                const color = colorOf(i)
                return (
                  <linearGradient key={`g${i}`} id={`tl-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color={color} stop-opacity="0.2" />
                    <stop offset="70%" stop-color={color} stop-opacity="0.9" />
                    <stop offset="100%" stop-color={color} stop-opacity="1" />
                  </linearGradient>
                )
              })}
            </defs>
            {/* 中轴 */}
            <line class="tl-axis-mid" x1={PAD_L} y1={baselineY} x2={W - PAD_R} y2={baselineY} />
            {/* "现在"竖线 + 标签 */}
            <line class="tl-now-line" x1={W - PAD_R} y1={PAD_T} x2={W - PAD_R} y2={H - PAD_B} />
            <text x={W - PAD_R + 4} y={PAD_T - 4} font-family="DM Mono" font-size="10" fill="#D9706A">现在</text>
            {/* 时间刻度 */}
            <text x={PAD_L} y={H - 10} font-family="DM Mono" font-size="9" fill="#B89098">90 天前</text>
            <text x={W / 2} y={H - 10} font-family="DM Mono" font-size="9" fill="#B89098" text-anchor="middle">45 天前</text>
            <text x={W - PAD_R} y={H - 10} font-family="DM Mono" font-size="9" fill="#B89098" text-anchor="end">今天</text>
            {/* v3.1.28 · 末端标签做垂直避让：按 endY 排序，相邻 < 14px 时下推 */}
            {(() => {
              // 先把所有 endPoint 算出来，做避让
              const meta = curves.map((c, i) => {
                const trend = trendOf(c)
                const color = colorOf(i)
                const [ex, ey] = endPointOf(c.series)
                const ratio = c.series.slice(6).reduce((s, n) => s + n, 0) / Math.max(1, c.series.slice(0, 3).reduce((s, n) => s + n, 0))
                const trendLabel = trend === 'rising' ? `+${ratio.toFixed(1)}×`
                  : trend === 'falling' ? '渐退' : '稳定'
                return { c, i, trend, color, ex, ey, trendLabel, labelY: ey + (ey < baselineY ? -8 : 14) }
              })
              // 按 labelY 升序避让（间距 ≥ 14px）
              const sorted = [...meta].sort((a, b) => a.labelY - b.labelY)
              for (let k = 1; k < sorted.length; k++) {
                const prev = sorted[k - 1]!
                const cur = sorted[k]!
                if (cur.labelY - prev.labelY < 14) cur.labelY = prev.labelY + 14
              }
              return meta.map(({ c, i, trend, color, ex, ey, trendLabel, labelY }) => {
                const isDashed = trend === 'falling'
                return (
                  <g key={c.cluster} class={`tl-curve-g tl-curve-${trend}`} style={`--curve-color:${color};--draw-delay:${i * 220}ms`}>
                    <path d={pathOf(c.series)} fill="none"
                      stroke={`url(#tl-grad-${i})`} stroke-width="2.6" stroke-linecap="round"
                      stroke-dasharray={isDashed ? '5,4' : undefined}
                      opacity={isDashed ? 0.75 : 1}
                      class="tl-curve-path" />
                    <circle cx={ex} cy={ey} r="3.5" fill={color}
                      class={trend === 'rising' ? 'tl-end-dot tl-end-dot-pulse' : 'tl-end-dot'} />
                    {/* 末端标签：连接线 + 文字。Y 经过避让 */}
                    {Math.abs(labelY - ey) > 2 && (
                      <line x1={ex} y1={ey} x2={ex - 6} y2={labelY - 3}
                        stroke={color} stroke-width="0.8" opacity="0.4" class="tl-end-leader" />
                    )}
                    <text x={ex - 10} y={labelY} font-family="DM Mono" font-size="10"
                      fill={color} text-anchor="end" class="tl-end-label">
                      {c.cluster} {trendLabel}
                    </text>
                  </g>
                )
              })
            })()}
          </svg>
        </div>
        <div class="tl-legend">
          {curves.map((c, i) => {
            const color = colorOf(i)
            const isDashed = trendOf(c) === 'falling'
            return (
              <span key={c.cluster} class="tl-leg-item">
                <span class="tl-leg-line" style={`background:${color};${isDashed ? 'background:repeating-linear-gradient(90deg,' + color + ' 0 4px,transparent 4px 7px);height:2px' : ''}`}></span>
                {c.cluster} · {c.total} 条
              </span>
            )
          })}
        </div>
        <div class="b-text" style="font-size:15px;margin-top:14px">{primaryNarrative}</div>
        {supportSignals.length > 0 && (
          <div class="tl-supports">
            <div class="tl-supports-eyebrow">还有这些在变 · {supportSignals.length === 1 ? '另一个' : `另 ${supportSignals.length} 个`}观察</div>
            {supportSignals.map((s) => (
              <div class="tl-support-item" key={s.kind}>
                <span class="tl-support-kind">{signalKindLabel(s.kind)}</span>
                <span class="tl-support-text">{s.narrative}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <PlaceholderChips sectionKey="timeline" contextHash={sectionTitle || 'timeline-empty'} />
    </section>
  )
}

/** §4 多维度信号的人类可读标签（用于"还有这些在变"列表的左侧 tag）*/
function signalKindLabel(kind: ChangeSignal['kind']): string {
  return {
    topic_migration: '主题',
    process_rate_change: '处理',
    chip_shift: '态度',
    stability: '稳定',
  }[kind]
}

// ─── §5 心理引导（Week 3 接入 PsychGuidanceService 后真接数据）─────

function GuidanceSection({ guidance }: { guidance: PsychGuidance }) {
  const slots = [
    { label: '看见模式', text: guidance.slots.naming },
    { label: '它的代价', text: guidance.slots.cost },
    { label: '一个小实验', text: guidance.slots.experiment },
    { label: '重构', text: guidance.slots.reframe },
  ]
  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 5 段 · 为什么会这样 · 你可以试试...</div>
      </div>
      <div class="bubble bubble-guidance">
        <div class="b-eyebrow">心理引导</div>
        <div class="b-text" style="font-size:15px;margin-bottom:6px">我看着你的数字想了一会，把它们换成话试试：</div>
        <div class="guide-grid">
          {slots.map((slot, i) => (
            <div class="guide-slot" key={i}>
              <div class="guide-label">
                <span class="guide-num">{i + 1}</span>
                {slot.label}
              </div>
              <div class="guide-text" dangerouslySetInnerHTML={{ __html: slot.text }} />
            </div>
          ))}
        </div>
      </div>
      <PlaceholderChips
        sectionKey="guidance"
        contextHash={(guidance.slots.naming || '').replace(/<[^>]+>/g, '').slice(0, 32) || 'guidance-empty'}
        extra={[{
          label: '愿意试 7 天 →',
          isCta: true,
          doneLabel: '✓ 7 天后见',
          // v1.1.4 · 点击注册 experiment · SW 7 天后发通知 + 顶部 banner 补看
          onClick: () => {
            chrome.runtime.sendMessage({
              type: 'REGISTER_EXPERIMENT',
              experimentText: guidance.slots.experiment,
              comboName: guidance.comboName,
            }).catch(() => {})
          },
        }]} />
    </section>
  )
}

// ─── §6 AI 反直觉 ───────────────────────────────────────

/** v3.1.13 · §6 占位（AI 没跑成或还在跑时显示，让用户知道这段还会有内容）*/
function HeadlinePlaceholder({ loading, consumptionId, itemCount }: {
  loading: boolean
  consumptionId?: string
  itemCount?: number
}) {
  // v3.1.25 · 按身份分支兜底文案
  //   - MINIMALIST（特别是 0/少数据兜底）: 先肯定极简作风 + 邀请未来 → 不能给"AI 没看出"这种 cold 文案
  //   - 其他身份: 通用"AI 还没准备好"
  const isMinimalist = consumptionId === 'minimalist'
  const isVerySparse = (itemCount ?? 0) < 15

  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 6 段 · AI 给你的反直觉发现</div>
      </div>
      <div class="bubble bubble-ai bubble-placeholder">
        <div class="b-eyebrow">最后一件事</div>
        {loading ? (
          <div class="b-text">
            <em>AI 正在看你的数据……</em>
          </div>
        ) : isMinimalist ? (
          <>
            <div class="b-text">
              <em>极简的人，<strong>不一定需要 AI 替你"再多看一眼"</strong>——你存得少而稳，已经是一种少见的清醒。</em>
            </div>
            <div class="b-evi">
              {isVerySparse
                ? '等书房里慢慢长出几条收藏（哪怕只是这一两周自然累积的），AI 会回来——它擅长从你已经成形的保存模式里，找一些"你自己也没意识到"的角度。在那之前，少即是多。'
                : 'AI 这一段擅长从更密的保存模式里挖反直觉——你的画像本身就足够清晰，未必需要被"再看一眼"。等你想看看书房在变成什么样时，再回到这里。'}
            </div>
          </>
        ) : (
          <>
            <div class="b-text">
              <em>这次 AI 还没准备好——可能是网络不稳，也可能它对你还没看出独特的"反直觉发现"。</em>
            </div>
            <div class="b-evi">
              下次打开 Profile 时这里会再尝试。前面 5 段已经把你大致画过一遍——AI 这一段是想再多看一眼"你自己可能没意识到"的角度。
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function HeadlineSection({
  finding,
  feedback,
  onFeedback,
}: {
  finding: Finding
  feedback: InsightFeedback['rating'] | null
  onFeedback: (r: InsightFeedback['rating']) => void
}) {
  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 第 6 段 · AI 给你的反直觉发现</div>
      </div>
      <div class="bubble bubble-ai">
        <div class="b-eyebrow">最后一件事</div>
        <div class="b-text">{finding.claim}</div>
        {finding.evidence && <div class="b-evi">{finding.evidence}</div>}
        {finding.aiNarrative && finding.aiNarrative.length > 0 && (
          <div class="b-narrative">
            {finding.aiNarrative.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}
      </div>
      {/* v3.1.28-2 · chips 放 bubble 外，跟 §1-§5 视觉一致 */}
      <div class="chips-wrap">
        <div class="chips">
          <button class={`chip ${feedback === 'accurate' ? 'chip-on' : ''}`} onClick={() => onFeedback('accurate')}>准</button>
          <button class={`chip ${feedback === 'partial' ? 'chip-on' : ''}`} onClick={() => onFeedback('partial')}>部分对</button>
          <button class={`chip ${feedback === 'not_accurate' ? 'chip-on' : ''}`} onClick={() => onFeedback('not_accurate')}>不准</button>
        </div>
      </div>
    </section>
  )
}

// ─── 辅助 ────────────────────────────────────────────

/**
 * v3.1.28 · 反馈芯片 · §1-§5 真接通 chrome.storage（之前是 placeholder 不存）
 *   数据结构独立于 §6 的 chord_insights_feedback：
 *     storage key: chord_section_feedback
 *     [{ sectionKey, contextHash, rating, customText, at }]
 *
 *   sectionKey: 'identity' / 'insight' / 'terrain' / 'timeline' / 'guidance'
 *   contextHash: 调用方传入的"当下展示内容指纹"（§1 用 comboCode、§4 用 sectionTitle...）
 *     —— 内容相同复用旧反馈（mount 时还原 chip-on）；内容变了重新收集
 *
 *   反馈数据当前不消费——为发布后调优身份系统准确性留数据基础
 */
const SECTION_FEEDBACK_KEY = 'chord_section_feedback'
type SectionRating = 'accurate' | 'partial' | 'not_accurate'
interface SectionFeedback {
  sectionKey: string
  contextHash: string
  rating: SectionRating | null
  customText?: string
  at: number
}
const RATING_MAP: Record<string, SectionRating> = { '准': 'accurate', '部分对': 'partial', '不准': 'not_accurate' }

async function loadSectionFeedback(sectionKey: string, contextHash: string): Promise<SectionFeedback | null> {
  try {
    const data = await chrome.storage.local.get(SECTION_FEEDBACK_KEY)
    const all = (data[SECTION_FEEDBACK_KEY] as SectionFeedback[] | undefined) ?? []
    return all.find((f) => f.sectionKey === sectionKey && f.contextHash === contextHash) ?? null
  } catch { return null }
}

/** v3.1.28 · 闭环 ② · 找最近一次同 sectionKey 但旧 contextHash 的"不准 / 部分对"反馈
 *  仅当当前内容（contextHash）跟反馈时不同 → 说明系统已经"换了角度" → 可以告诉用户「上次你说不准」
 *  返回 null 表示不显示 hint
 */
async function loadStaleHint(sectionKey: string): Promise<{ rating: SectionRating; customText?: string } | null> {
  try {
    const data = await chrome.storage.local.get(SECTION_FEEDBACK_KEY)
    const all = (data[SECTION_FEEDBACK_KEY] as SectionFeedback[] | undefined) ?? []
    // 同 sectionKey + rating 是 not_accurate / partial 的最新一条
    const candidates = all.filter((f) => f.sectionKey === sectionKey && (f.rating === 'not_accurate' || f.rating === 'partial'))
    if (candidates.length === 0) return null
    const latest = candidates.sort((a, b) => b.at - a.at)[0]!
    return { rating: latest.rating as SectionRating, customText: latest.customText }
  } catch { return null }
}

async function saveSectionFeedback(fb: SectionFeedback): Promise<void> {
  try {
    const data = await chrome.storage.local.get(SECTION_FEEDBACK_KEY)
    const all = (data[SECTION_FEEDBACK_KEY] as SectionFeedback[] | undefined) ?? []
    const idx = all.findIndex((f) => f.sectionKey === fb.sectionKey && f.contextHash === fb.contextHash)
    if (idx >= 0) all[idx] = fb
    else all.push(fb)
    const trimmed = all.slice(-200)  // 防爆
    await chrome.storage.local.set({ [SECTION_FEEDBACK_KEY]: trimmed })
  } catch (e) {
    console.warn('[Chord] saveSectionFeedback failed:', e)
  }
}

function PlaceholderChips({
  sectionKey,
  contextHash,
  extra,
}: {
  sectionKey: string
  contextHash: string
  // v1.1.4 · extra chip 加 onClick 回调（用于"愿意试 7 天"注册 experiment）
  extra?: { label: string; isCta?: boolean; onClick?: () => void; doneLabel?: string }[]
}) {
  const [rating, setRating] = useState<SectionRating | null>(null)
  const [extraDone, setExtraDone] = useState<Set<number>>(new Set())
  const [showInput, setShowInput] = useState(false)
  const [customText, setCustomText] = useState('')
  const [submittedCustom, setSubmittedCustom] = useState(false)
  // v3.1.28 · 闭环 ② · "上次你说不准"的旧反馈记录（contextHash 变了时显示，让用户看到系统响应了）
  const [staleHint, setStaleHint] = useState<{ rating: SectionRating; customText?: string } | null>(null)

  // mount + contextHash 变化 → 从 storage 还原
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 当前 contextHash 的反馈
      const fb = await loadSectionFeedback(sectionKey, contextHash)
      if (cancelled) return
      if (fb) {
        setRating(fb.rating)
        if (fb.customText) { setCustomText(fb.customText); setSubmittedCustom(true) }
        else { setSubmittedCustom(false); setCustomText('') }
        setStaleHint(null)   // 当前就是反馈过的内容 → 不显示 stale hint
      } else {
        setRating(null); setCustomText(''); setSubmittedCustom(false)
        // 新内容：查 storage 里有没有"同 sectionKey 但旧 contextHash"的不准/部分对反馈 →
        // 说明 AI/算法已经因为反馈而改了输出，给用户一个 hint 「上次你说不准——这一次换了角度」
        const stale = await loadStaleHint(sectionKey)
        if (cancelled) return
        setStaleHint(stale)
      }
    })()
    return () => { cancelled = true }
  }, [sectionKey, contextHash])

  function persist(next: { rating?: SectionRating | null; customText?: string }) {
    void saveSectionFeedback({
      sectionKey,
      contextHash,
      rating: next.rating !== undefined ? next.rating : rating,
      customText: next.customText !== undefined ? next.customText : (submittedCustom ? customText : undefined),
      at: Date.now(),
    })
  }

  function handleRating(label: string) {
    const newRating = RATING_MAP[label]!
    const next: SectionRating | null = rating === newRating ? null : newRating
    setRating(next)
    persist({ rating: next })
  }

  function submitCustom() {
    if (!customText.trim()) return
    setSubmittedCustom(true)
    setShowInput(false)
    persist({ customText: customText.trim() })
  }

  function clearCustom() {
    setSubmittedCustom(false); setCustomText('')
    persist({ customText: undefined })
  }

  return (
    <div class="chips-wrap">
      {/* v3.1.28 · 闭环 ② · "上次你说不准——我重新想了一下" hint */}
      {staleHint && (
        <div class="chips-stale-hint">
          <span class="chips-stale-icon">↻</span>
          <span>
            上次你说{staleHint.rating === 'not_accurate' ? '不准' : '部分对'}
            {staleHint.customText ? ` ——「${staleHint.customText.slice(0, 24)}${staleHint.customText.length > 24 ? '…' : ''}」` : ''}
            ，这一次我换了角度。
          </span>
        </div>
      )}
      <div class="chips">
        {['准', '部分对', '不准'].map((r) => (
          <button
            key={r}
            class={`chip ${rating === RATING_MAP[r] ? 'chip-on' : ''}`}
            onClick={() => handleRating(r)}
          >{r}</button>
        ))}
        {extra?.map((e, i) => (
          <button
            key={`x-${i}`}
            class={`chip ${e.isCta ? 'chip-cta' : 'chip-input'} ${extraDone.has(i) ? 'chip-done' : ''}`}
            onClick={() => {
              if (extraDone.has(i)) return  // 已点过不重复触发
              const next = new Set(extraDone)
              next.add(i)
              setExtraDone(next)
              e.onClick?.()  // v1.1.4 · 回调触发 REGISTER_EXPERIMENT
            }}
          >{extraDone.has(i) ? (e.doneLabel ?? '✓ 已记下') : e.label}</button>
        ))}
        <button
          class={`chip chip-input ${showInput || submittedCustom ? 'chip-on' : ''}`}
          onClick={() => {
            if (submittedCustom) clearCustom()
            else setShowInput(!showInput)
          }}
        >{submittedCustom ? '✓ 已留下你的话' : '＋ 我来说'}</button>
      </div>
      {showInput && (
        <div class="chip-input-area">
          <input
            class="chip-text-input"
            placeholder="你的想法（只你自己能看到）..."
            value={customText}
            onInput={(e) => setCustomText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCustom() }}
            autoFocus
          />
          <button class="chip-text-submit" onClick={submitCustom} disabled={!customText.trim()}>提交</button>
          <button class="chip-text-cancel" onClick={() => { setShowInput(false); setCustomText('') }}>×</button>
        </div>
      )}
    </div>
  )
}

/** v3.1.28 · 分享卡 Modal · 三卡同框版（照 §1 你是谁的"主大次小同框"布局）
 *  布局：HDG 标题 → 副卡 + 主卡 + 副卡 同框 → 综合 narrative → 数据条 → 品牌
 *  每张副卡内含：图 + 维度名 + EN + 中文名
 *  主卡内含：大图 + 维度名 + EN 大字 + 中文名 + claim + 该维度 evidence
 */
function ShareCardModal({ cards, comboName, items, onClose }: {
  cards: IdentityCard[]
  comboName: string
  items: Item[]
  onClose: () => void
}) {
  const main = cards[0]
  if (!main) return null
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function handleDownload() {
    if (!cardRef.current || downloading) return
    setDownloading(true)
    try {
      // 动态 import 避免初次加载就引入 html2canvas（仅在用户真的点下载时才下）
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,  // 2× 输出，朋友圈/小红书清晰
        useCORS: true,
        logging: false,
      })
      canvas.toBlob((blob) => {
        if (!blob) { setDownloading(false); setToast('生成失败'); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const code = IdentityService.getComboCode(cards)
        const date = new Date().toISOString().slice(0, 10)
        a.href = url
        a.download = `Chord_${code}_${date}.png`
        a.click()
        URL.revokeObjectURL(url)
        setToast('已保存到下载目录')
        setTimeout(() => setToast(null), 2400)
        setDownloading(false)
      }, 'image/png')
    } catch (e) {
      console.warn('[Chord] share card download failed:', e)
      setToast('下载失败 · 试试右键保存')
      setTimeout(() => setToast(null), 2400)
      setDownloading(false)
    }
  }
  const content = items.filter((i) => i.type === 'content')
  const total = content.length
  const processed = content.filter((i) => i.status !== 'pending').length
  const processRate = total > 0 ? Math.round(processed / total * 100) : 0
  const DAY = 86_400_000
  const now = Date.now()
  const recent30 = content.filter((i) => i.savedAt > now - 30 * DAY).length
  const code = IdentityService.getComboCode(cards)
  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
  const narrative = comboNarrative(cards)
  // 维度顺序固定（消费 → 心境 → 半径），主卡居中
  const dimOrder: IdentityDimension[] = ['consumption', 'mindset', 'radius']
  const byDim = new Map(cards.map((c) => [c.dimension, c]))
  const dimLabelMini: Record<IdentityDimension, string> = {
    consumption: '消费风格',
    mindset: '心境',
    radius: '半径',
  }
  const imgPath = (id: string) => `/assets/identity-art/chatgpt/${id.toUpperCase()}.png`
  // 主卡 = main（按 extremity 排序后第一张），副卡 = 其他两张按 dim 顺序
  const sideCards = dimOrder.filter((d) => d !== main.dimension).map((d) => ({ dim: d, card: byDim.get(d) }))

  return (
    <div class="share-modal-backdrop" onClick={onClose}>
      <div class="share-modal-body" onClick={(e) => e.stopPropagation()}>
        <div ref={cardRef} class="share-card share-card-deck">
          <div class="sc-top" style="width:100%">
            <span class="sc-top-eye">CHORD · IDENTITY</span>
            <span class="sc-top-date">{dateStr}</span>
          </div>
          {/* 顶部 HDG + 综合名 */}
          <div class="sc-triad-head">
            <div class="sc-triad-code">{code}</div>
            {comboName && <div class="sc-triad-name">{comboName}</div>}
          </div>
          {/* 主大次小三卡同框 —— 完全照 §1 的视觉关系 */}
          <div class="sc-deck">
            {/* 左副卡 */}
            {sideCards[0]?.card ? (
              <div class={`sc-side-card sc-side-${sideCards[0].dim}`}>
                <div class="sc-side-img"><img src={imgPath(sideCards[0].card.id)} alt={sideCards[0].card.enName} /></div>
                <div class="sc-side-dim">{dimLabelMini[sideCards[0].dim]}</div>
                <div class="sc-side-en">{sideCards[0].card.enName}</div>
                <div class="sc-side-zh">{sideCards[0].card.name}</div>
              </div>
            ) : (() => {
              // v0.1.2 · 缺数据态也用 UNSEEN_*.png + hint 文案，跟 §1 视觉一致
              const dim = sideCards[0]?.dim ?? 'mindset'
              return (
                <div class={`sc-side-card sc-side-${dim} sc-side-empty`}>
                  <div class="sc-side-img"><img src={`/assets/identity-art/chatgpt/${UNSEEN_IMG[dim]}.png`} alt={`${dimLabelMini[dim]} · 还看不清`} /></div>
                  <div class="sc-side-dim">{dimLabelMini[dim]}</div>
                  <div class="sc-side-en">还看不清</div>
                  <div class="sc-side-zh">{EMPTY_HINT_SHORT[dim]}</div>
                </div>
              )
            })()}
            {/* 主卡 = main */}
            <div class="sc-main-card">
              <div class="sc-main-img"><img src={imgPath(main.id)} alt={main.enName} /></div>
              <div class="sc-main-body">
                {/* 顶部团：维度 / EN / 中文名 */}
                <div class="sc-main-head">
                  <div class="sc-main-dim">{dimLabelMini[main.dimension]}</div>
                  <div class="sc-main-en">{main.enName}</div>
                  <div class="sc-main-zh">{main.name}</div>
                </div>
                {/* 底部团：claim + 该维度 evidence（填补中间空白）*/}
                <div class="sc-main-foot">
                  <div class="sc-main-claim">{main.claim}</div>
                  {main.evidence && <div class="sc-main-evi">{main.evidence}</div>}
                </div>
              </div>
            </div>
            {/* 右副卡 */}
            {sideCards[1]?.card ? (
              <div class={`sc-side-card sc-side-${sideCards[1].dim}`}>
                <div class="sc-side-img"><img src={imgPath(sideCards[1].card.id)} alt={sideCards[1].card.enName} /></div>
                <div class="sc-side-dim">{dimLabelMini[sideCards[1].dim]}</div>
                <div class="sc-side-en">{sideCards[1].card.enName}</div>
                <div class="sc-side-zh">{sideCards[1].card.name}</div>
              </div>
            ) : (() => {
              const dim = sideCards[1]?.dim ?? 'radius'
              return (
                <div class={`sc-side-card sc-side-${dim} sc-side-empty`}>
                  <div class="sc-side-img"><img src={`/assets/identity-art/chatgpt/${UNSEEN_IMG[dim]}.png`} alt={`${dimLabelMini[dim]} · 还看不清`} /></div>
                  <div class="sc-side-dim">{dimLabelMini[dim]}</div>
                  <div class="sc-side-en">还看不清</div>
                  <div class="sc-side-zh">{EMPTY_HINT_SHORT[dim]}</div>
                </div>
              )
            })()}
          </div>
          {/* 综合 narrative —— 体现"三和弦"而非单卡。按句号自然分行避免挤成一团 */}
          {narrative && (
            <div class="sc-claim">
              {narrative.split('。').filter((p) => p.trim()).map((p, i) => (
                <div key={i} class="sc-claim-line">{p}。</div>
              ))}
            </div>
          )}
          <div class="sc-divider"></div>
          <div class="sc-evi">
            <span class="sc-evi-row">{total} 条收藏</span>·
            <span class="sc-evi-row">处理率 {processRate}%</span>·
            <span class="sc-evi-row">30 天新增 {recent30} 条</span>
          </div>
          <div class="sc-foot">
            <div class="sc-brand">
              <div class="sc-brand-logo">
                {/* v3.1.28 · width/height 改成跟 viewBox 比例一致 (120:100 = 24:20)
                    + 加 xmlns 让 html2canvas-pro 能正确解析 SVG namespace */}
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="20" viewBox="0 0 120 100" fill="none" style="flex-shrink:0">
                  <path d="M82 18 Q28 18 28 50 Q28 82 82 82" stroke="#D9706A" stroke-width="5" stroke-linecap="round"/>
                  <path d="M82 34 Q44 34 44 50 Q44 66 82 66" stroke="#D9706A" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
                  <circle cx="87" cy="50" r="4" fill="#D9706A"/>
                  <circle cx="99" cy="50" r="2.8" fill="#D9706A" opacity="0.65"/>
                  <circle cx="109" cy="50" r="1.8" fill="#D9706A" opacity="0.35"/>
                </svg>
                <span class="sc-brand-name">Chord 回响</span>
              </div>
              <div class="sc-brand-slogan">念念不忘，必有回响</div>
            </div>
          </div>
        </div>
        {/* 旁边动作面板 · v3.1.28 不预生成文案——让用户看到卡自己写一句 */}
        <div class="share-actions">
          <div class="sa-title">{code}{comboName && ` · ${comboName}`}</div>
          <div class="sa-hint">下载图片 → 配一句你想说的话发出去</div>
          <button class="sa-btn primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? '正在生成…' : '下载图片'}
          </button>
          <button class="sa-btn ghost" onClick={onClose}>关闭</button>
          {toast && <div class="sa-toast">{toast}</div>}
          <div class="sa-foot">1:1 · 微信 / IM 友好</div>
        </div>
      </div>
    </div>
  )
}

/** 三维身份组合命名（简版查表 + 兜底） */
function deriveComboName(cards: IdentityCard[]): string {
  if (cards.length < 2) return ''
  const ids = cards.map((c) => c.id).sort().join('+')
  const table: Record<string, string> = {
    // v3.0 已有 9 个
    'explorer+generalist+hoarder': '信息焦虑囤积家',
    'deepener+generalist+hoarder': '多线深挖型囤积家',
    'curator+settler+specialist': '深耕策展人',
    'executor+seeker+specialist': '目标驱动型专家',
    'generalist+returner+thinker': '反思型杂食回归者',
    'settler+slow_reader+specialist': '慢品大师',
    'hoarder+returner+specialist': '怀旧型醒悟者',
    'executor+explorer+switcher': '短时实验家',
    'curator+explorer+generalist': '审美型杂食家',
    // v3.1 新增 MINIMALIST / DORMANT 组合
    'explorer+generalist+minimalist': '轻盈漫游者',
    'minimalist+settler+specialist': '静默深耕者',
    'dormant+generalist+hoarder': '沉睡的囤积家',
  }
  // 命中已命名组合 → 用人工拟的"画像名"
  if (table[ids]) return table[ids]!
  // v3.1.21 · 未命名组合 → 算法合成一个 4-5 字画像名（"[消费形容词][心境动作]者"）
  //   例: MKG → "轻盈追寻者"（min轻盈 + seeker追寻 + 者）
  //        CRG → "精挑回望者"（curator精挑 + returner回望 + 者）
  //   不再返回三个名字拼起来——那读起来是标签，不是画像
  return synthesizeComboName(cards)
}

/**
 * v3.1.21 · 算法合成画像名 · 用于未命名组合
 * 模式：{consumption-形容词}{mindset-动作}{radius-suffix}
 *   - consumption 出 2 字形容词（语气：持续画像）
 *   - mindset 出 2 字动作（语气：当下状态）
 *   - radius 出 1 字 suffix（者 / 家——区分广博 vs 深耕的语气）
 *
 * 缺维度时降级：
 *   - 只有 consumption + mindset → "{c-adj}{m-verb}者"
 *   - 只有 consumption → "{c-adj}型"
 *   - 只有 mindset → "{m-verb}者"
 */
function synthesizeComboName(cards: IdentityCard[]): string {
  const c = cards.find((x) => x.dimension === 'consumption')
  const m = cards.find((x) => x.dimension === 'mindset')
  const r = cards.find((x) => x.dimension === 'radius')

  const cAdj: Record<string, string> = {
    hoarder: '囤积',
    curator: '精挑',
    executor: '实战',
    thinker: '深思',
    slow_reader: '慢品',
    minimalist: '轻盈',
    balanced: '稳态',
  }
  const mVerb: Record<string, string> = {
    explorer: '漫游',
    deepener: '深挖',
    seeker: '追寻',
    returner: '回望',
    settler: '沉静',
    dormant: '沉睡',
  }
  // radius 提供 suffix 区分语气
  //   specialist: 者（专精）
  //   generalist: 家（杂食、广博常用"家"字）
  //   switcher: 派（摇摆、有派别感）
  const rSuffix: Record<string, string> = {
    specialist: '者',
    generalist: '家',
    switcher: '派',
  }

  const cPart = c ? cAdj[c.id] ?? c.name : ''
  const mPart = m ? mVerb[m.id] ?? m.name : ''
  const rPart = r ? rSuffix[r.id] ?? '者' : '者'

  if (c && m) return `${cPart}${mPart}${rPart}`
  if (c && !m) return `${cPart}型`
  if (!c && m) return `${mPart}${rPart}`
  return ''
}

/** v3.1 · 12 个已命名组合的真叙述（不是 key-value 拼接，是把三维织进一段人物画像）*/
const COMBO_NARRATIVES: Record<string, string> = {
  // v3.0 已有 9 个组合
  'explorer+generalist+hoarder':
    '你的好奇心比胃口大——这一阵子又新开了几条线，但旧的还堆在书房里没动。每次打开收藏夹，都是一次小小的"我还没读完"提醒。',
  'curator+settler+specialist':
    '你的注意力像一束聚焦的光——只照在你已经选定的那片土地上。这一阵不在追新，是在让已有的东西沉下去。',
  'executor+seeker+specialist':
    '你保存即用，用即清——一个方向、一种节奏。最近被一件事紧紧抓住，没有多余的注意力分给别处。',
  'generalist+returner+thinker':
    '你的世界很宽，但你总会回头——读到某条老收藏，想问问当时的自己为什么留下它。每一次回头，都是一次小的整理。',
  'settler+slow_reader+specialist':
    '你跟内容相处的节奏比世界慢半拍——一条文章你愿意等上几个月再决定。这阵子的你更静了，几乎不在意有什么新东西在流过。',
  'hoarder+returner+specialist':
    '你在跟过去的自己谈判——那些堆了多年的旧收藏，开始一件一件处理，承认有的人和事你已经不需要了。',
  'executor+explorer+switcher':
    '你像在地形里扫描——一周一个领域，深一脚浅一脚。但每一脚都算数，存下的你都用过。',
  'curator+explorer+generalist':
    '你的收藏夹像一本有品味的杂志——什么都看，但只留精品。门槛是双重的：好奇心 + 审美。',
  'deepener+generalist+hoarder':
    '你在好几条路上同时往深里走——不开新方向，但每条都在加重。保存的速度始终在快过处理速度。',
  // v3.1 新增 MINIMALIST / DORMANT 组合
  'explorer+generalist+minimalist':
    '你不囤但敢试——存下的少而轻，却覆盖很多方向。每一条都是真的进了你的脑子。',
  'minimalist+settler+specialist':
    '你的世界很窄、也很安静——一个方向、几本书、一个慢慢沉下去的节奏。没有焦虑，没有追赶。',
  'dormant+generalist+hoarder':
    '你这阵子离开了——书房里还堆着没处理的内容，等了几个月。不是抛弃，是被生活带去了别处。',
}

/**
 * v3.1.21 智能 fallback · 叙事感重构
 *
 * 旧设计（v3.1.8）：3 句独立陈述拼起来 → 读起来是"标签罗列"
 *   "你不轻易保存。你最近被一个方向紧紧抓住——你的注意力像一张网撒得很开。"
 *
 * 新设计：把 consumption + radius 融合成"持续画像主语"，mindset 作为"当下转折"
 *   "不轻易保存的你兴趣很广泛，但是最近你被一个方向紧紧抓住。"
 *                ↑ consumption-modifier  ↑ radius-tail   ↑ connector  ↑ mindset-clause
 *
 * 关键：connector 显化 mindset 跟持续画像之间的张力——
 *   反差大（SEEKER+GENERALIST / EXPLORER+SPECIALIST 等）→ "但是"
 *   方向一致 → "，"
 *
 * 数据：见 CONSUMPTION_MODIFIER / RADIUS_TAIL / MINDSET_CLAUSE 三个新表
 */
function buildFallbackNarrative(
  consumption: IdentityCard | undefined,
  mindset: IdentityCard | undefined,
  radius: IdentityCard | undefined,
): string {
  // ── 三维都在：融合叙事 ──
  if (consumption && mindset && radius) {
    const subject = buildSubjectClause(consumption, radius)
    const moodClause = MINDSET_CLAUSE[mindset.id] ?? `这阵子你像${mindset.name}`
    const conn = pickConnector(consumption.id, radius.id, mindset.id)
    return `${subject}${conn}${moodClause}。`
  }
  // ── 两维 ──
  if (consumption && mindset) {
    const cMod = CONSUMPTION_MODIFIER[consumption.id] ?? consumption.name
    const moodClause = MINDSET_CLAUSE[mindset.id] ?? `这阵子你像${mindset.name}`
    const conn = pickConnector(consumption.id, undefined, mindset.id)
    return `${cMod}的你${conn}${moodClause}。`
  }
  if (consumption && radius) {
    // C + R 直接做完整主语+谓语
    return `${buildSubjectClause(consumption, radius)}。`
  }
  if (mindset && radius) {
    const moodClause = MINDSET_CLAUSE[mindset.id] ?? `这阵子你像${mindset.name}`
    const rTail = RADIUS_TAIL[radius.id] ?? '兴趣分布有自己的样子'
    return `${moodClause}，${rTail}。`
  }
  // ── 一维：fallback 到老 phrase（自带主语）──
  const c = consumption ? CONSUMPTION_PHRASE[consumption.id] ?? `你像${consumption.name}` : null
  const m = mindset ? MINDSET_PHRASE[mindset.id] ?? `你这阵子像${mindset.name}` : null
  const r = radius ? RADIUS_PHRASE[radius.id] ?? `你的注意力像${radius.name}` : null
  return (c ?? m ?? r ?? '') + '。'
}

/**
 * v3.1.21 · 把 consumption + radius 融合成一个"持续画像"主语短语
 *   pattern: "{C-modifier}的你{R-tail}"
 *   例: minimalist + generalist → "不轻易保存的你兴趣很广泛"
 *       hoarder + specialist → "什么都想存的你深耕在少数几个领域"
 */
function buildSubjectClause(c: IdentityCard, r: IdentityCard): string {
  const cMod = CONSUMPTION_MODIFIER[c.id] ?? c.name
  const rTail = RADIUS_TAIL[r.id] ?? '兴趣分布有自己的样子'
  // v3.1.25 · 加逗号让"的你"独立——避免长句压塌
  //   旧: "保存即用、用即清的你深耕在少数几个领域"
  //   新: "保存即用、用即清的你，深耕在少数几个领域"
  return `${cMod}的你，${rTail}`
}

/**
 * v3.1.21 · 选 connector 让叙事感成立
 *   反差对 → "但是" / "不过"（凸显 mindset 的当下转折）
 *   一致对 → "，" + "最近也" / 自然衔接
 *   中性 → "，"
 *
 * 反差规则（粗略，结合常识）：
 *   - SEEKER（被一个方向抓住）vs GENERALIST/SWITCHER（广博/多变）→ 但是
 *   - EXPLORER（开新方向）vs SPECIALIST（深耕）→ 但是
 *   - DEEPENER（不开新方向）vs SWITCHER（多变）→ 但是
 *   - DORMANT（沉睡）vs 任何活跃 consumption（hoarder/executor/curator/thinker）→ 不过
 *   - 其余 → "，"
 */
function pickConnector(
  cId: string,
  rId: string | undefined,
  mId: string,
): string {
  // mindset vs radius 反差
  if (rId) {
    if (mId === 'seeker' && (rId === 'generalist' || rId === 'switcher')) return '，但是'
    if (mId === 'explorer' && rId === 'specialist') return '，但是'
    if (mId === 'deepener' && rId === 'switcher') return '，但是'
  }
  // mindset vs consumption 反差
  if (mId === 'dormant' && ['hoarder', 'executor', 'curator', 'thinker'].includes(cId)) return '，不过'
  // v3.1.25 移除：EXECUTOR + RETURNER 不算反差（行动者整理过去项目库是合理延续），用默认 "，"
  if (mId === 'seeker' && cId === 'minimalist') return '，但是'
  // 默认中性衔接
  return '，'
}

/**
 * v3.1.8 每个身份的画像短语
 * 设计规则：
 *   - 每条都自带完整主语（"你"/"你的"）→ 可独立成句
 *   - consumption 用"持续画像"语气（"你像..." / "你保存..."）
 *   - mindset 用"当下"语气（"你最近..." / "你正在..." / "你这阵子..."）
 *   - radius 用"注意力分布"语气（"你的注意力..."）
 */
const CONSUMPTION_PHRASE: Record<string, string> = {
  hoarder: '你像个不会过期的图书馆',
  curator: '你的收藏有明显的"门槛感"',
  executor: '你保存即用、用即清',
  thinker: '你保存内容是为了滋养想法',
  // v3.1.16 改 · "慢半拍" 太笼统 + 跟其他"慢"重复
  //   - SLOW_READER 真实特质 = 慢但用心地"品"——不是简单的慢，是有 mindfulness 的慢
  //   - 让 SLU 跟 HLU 形成区分：SLU 是"慢品但这阵子停了"，HLU 是"图书馆但这阵子停了"
  slow_reader: '你跟内容是慢慢品',
  // v3.1.25 改 · "你不轻易保存" 太单薄。MINIMALIST 的真实画像是"跟内容关系节制 + 存下的少而精"
  //   - 用"节制"字眼把 MINIMALIST 跟其他类区分开（不是"懒"、不是"忙"、是有意识的少）
  //   - "少而精" 顺承"节制"，强调每条都是有意识选择的精品
  minimalist: '你跟内容的关系是节制，存下的少而精',
  balanced: '你跟内容相处得很均衡',
}
const MINDSET_PHRASE: Record<string, string> = {
  explorer: '你最近又敢飞了，四处试',
  deepener: '你最近不开新地，在已有的几条路上加深',
  seeker: '你最近被一个方向紧紧抓住',
  // v3.1.19 改 · "跟过去的自己谈判" 太抽象（"谈判"指代不清，破折号连接不顺）
  //   - RETURNER 真实信号 = 最近 30 天处理多条 90 天前的老 item（多数是 release）
  //   - 改成具体动作 "翻老收藏，做决定" → 跟后续半径短语用 "——" 连接时读起来是
  //     "你正在翻老收藏，做决定——你的注意力像一张网撒得很开"，前句述行为后句述范围，逻辑通顺
  returner: '你正在翻老收藏，做决定',
  // v3.1.16 改 · "慢下来了" 跟 SLOW_READER 的"慢半拍"重复，且没说清 SETTLER 的核心
  //   - SETTLER 真实信号: recentMonthly < 0.6× + brandNew=0 + 老 item 处理率低
  //   - 即"新的没存 + 旧的也没翻"的全面安静
  settler: '你这一阵新的没存，旧的也没翻',
  // v3.1.25 改 · "在沉睡" 抽象隐喻 → "很少来书房" 更具体，跟 Chord 的"书房"语义一致
  dormant: '你这阵子似乎很少来书房',
}
const RADIUS_PHRASE: Record<string, string> = {
  // v3.1.8 加"你的"前缀：之前缺主语会让用户读到"注意力 xxx"感到孤立
  specialist: '你的注意力深耕在少数几个领域',
  generalist: '你的注意力像一张网撒得很开',
  switcher: '你的注意力像潮汐，一阵一群',
}

/**
 * v3.1.21 · CONSUMPTION 修饰短语（无主语，用作"___的你"前定语）
 *   例: "不轻易保存" + "的你" → "不轻易保存的你"
 */
const CONSUMPTION_MODIFIER: Record<string, string> = {
  hoarder: '什么都想存',
  curator: '门槛严苛',
  executor: '保存即用、用即清',
  thinker: '把内容当思考原料',
  slow_reader: '慢慢品的',
  // v3.1.25 · 同 CONSUMPTION_PHRASE 修法——"不轻易保存" 太单薄
  //   modifier 用在"___的你___" 句式，需短一点，用"跟内容的关系节制"压缩
  minimalist: '跟内容的关系节制',
  // v3.1.25 · "保存得很均衡" 太抽象（均衡指啥？）。改"存得稳，不囤也不挑剔"——
  //   双向定义（不极端囤 + 不极端挑），"稳"字呼应 BALANCED 的稳态身份
  balanced: '存得稳、不囤也不挑剔',
}

/**
 * v3.1.21 · RADIUS 后缀短语（接在"___的你"后做谓语，描述兴趣范围）
 *   例: "不轻易保存的你" + "兴趣很广泛" → "不轻易保存的你兴趣很广泛"
 */
const RADIUS_TAIL: Record<string, string> = {
  specialist: '深耕在少数几个领域',
  generalist: '兴趣很广泛',
  switcher: '口味很多变',
}

/**
 * v3.1.21 · MINDSET 当下短语（小句，作叙事下半句）
 *   注意：开头不要"你"——connector 后会自动出现"最近"或主语；
 *   例: "最近你被一个方向紧紧抓住" 作为"，但是"之后的下半句
 */
// v3.1.25 修 · 去掉每条 clause 的"你"——subject 已含"的你"，避免主语重复
//   旧: "保存即用的你深耕在...，最近你正在翻老收藏，做决定"（重复"你"）
//   新: "保存即用的你，深耕在...，最近正在翻老收藏，做着决定"
//   RETURNER 末改"做着决定"——动作进行感更贴 "正在翻" 的当下语气
const MINDSET_CLAUSE: Record<string, string> = {
  explorer: '最近又敢飞了，四处试',
  deepener: '最近不开新地，在已有的几条路上加深',
  seeker: '最近被一个方向紧紧抓住',
  returner: '最近正在翻老收藏，做着决定',
  settler: '这一阵新的没存，旧的也没翻',
  dormant: '这阵子似乎很少来书房',
}

function comboNarrative(cards: IdentityCard[]): string {
  if (cards.length === 0) return ''
  const consumption = cards.find((c) => c.dimension === 'consumption')
  const mindset = cards.find((c) => c.dimension === 'mindset')
  const radius = cards.find((c) => c.dimension === 'radius')

  // 命中已命名组合 → 用人工写的真叙述
  if (consumption && mindset && radius) {
    const key = [consumption.id, mindset.id, radius.id].sort().join('+')
    const narrative = COMBO_NARRATIVES[key]
    if (narrative) return narrative
  }

  // 未命中 → 算法 fallback，仍然是叙述风格不是 key-value
  return buildFallbackNarrative(consumption, mindset, radius)
}

// §5 心理引导文案由 PsychGuidanceService 提供（包含 8 个组合 × 4 槽 + 主身份兜底 + universal fallback）

// ─── v1.1.4 · §5 后接的实验历史时间线 ────────────────────────

const EXPERIMENT_STORAGE_KEY = 'chord_experiments'
const experimentsList = signal<Experiment[]>([])

function loadExperiments() {
  chrome.storage.local.get(EXPERIMENT_STORAGE_KEY, (data) => {
    experimentsList.value = (data[EXPERIMENT_STORAGE_KEY] as Experiment[] | undefined) ?? []
  })
}

const OUTCOME_LABEL: Record<string, string> = {
  changed: '✓ 有改变了',
  partial: '一般',
  not_done: '× 没真做到',
}
const OUTCOME_COLOR: Record<string, string> = {
  changed: '#3D8B4A',
  partial: 'var(--text-md)',
  not_done: 'var(--text-lt)',
}

function ExperimentHistorySection() {
  useEffect(() => {
    loadExperiments()
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes[EXPERIMENT_STORAGE_KEY]) loadExperiments()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => { chrome.storage.onChanged.removeListener(listener) }
  }, [])

  const list = experimentsList.value
  // 显示：所有 experiments（active 未到期显示"还剩 N 天"; due 提示补选; completed 记录 outcome）
  //   completed 只展示最近 5 条避免过长
  const recent = [...list]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 8)
  if (recent.length === 0) return null

  return (
    <section class="seg">
      <div class="seg-head">
        <div class="seg-avatar">回</div>
        <div class="seg-name">回响 · 你试过的实验</div>
      </div>
      <div class="bubble" style="background:var(--card);border:1px solid var(--border)">
        <div class="b-eyebrow">承诺 · 回访 · 沉淀</div>
        <ul style="margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px">
          {recent.map((e) => {
            const days = Math.floor((Date.now() - e.startedAt) / 86_400_000)
            const cleanText = e.experimentText.replace(/<[^>]+>/g, '').slice(0, 80)
            const daysRemain = Math.ceil((e.expiresAt - Date.now()) / 86_400_000)
            return (
              <li key={e.id} style="padding:8px 0;border-bottom:1px dashed var(--border);font-size:13px">
                <div style="color:var(--text-md);font-size:11px;margin-bottom:2px">
                  {new Date(e.startedAt).toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'})}
                  {' · '}
                  {e.status === 'active' && daysRemain > 0 && <span>还剩 {daysRemain} 天</span>}
                  {e.status === 'due' && <span style="color:var(--rose)">等你反馈</span>}
                  {e.status === 'skipped' && <span style="color:var(--text-lt)">已跳过</span>}
                  {e.status === 'completed' && e.outcome && (
                    <span style={`color:${OUTCOME_COLOR[e.outcome]}`}>{OUTCOME_LABEL[e.outcome]}</span>
                  )}
                  {e.status !== 'active' && ' · '}
                  {e.status !== 'active' && `${days} 天前承诺`}
                </div>
                <div style="color:var(--text);font-family:'Source Serif 4',serif;font-style:italic;line-height:1.5">
                  「{cleanText}」
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
