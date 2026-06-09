/**
 * Preview 工具用的 chrome API shim
 *
 * 目的：在浏览器开发环境模拟 chrome.storage/runtime/history，让 Profile 等组件能跑起来
 * 不依赖真实扩展环境。
 *
 * 用法：在 preview/main.tsx 的最顶部 import 这个文件，会立刻替换 window.chrome。
 */

type Listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void

interface ChromeShim {
  storage: {
    local: {
      get(keys?: string | string[] | Record<string, unknown> | null, cb?: (items: Record<string, unknown>) => void): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>, cb?: () => void): Promise<void>
      remove(keys: string | string[], cb?: () => void): Promise<void>
      clear(cb?: () => void): Promise<void>
      onChanged: { addListener(l: Listener): void; removeListener(l: Listener): void }
    }
    onChanged: { addListener(l: Listener): void; removeListener(l: Listener): void }
  }
  runtime: {
    getURL(path: string): string
    sendMessage(msg: unknown, cb?: (resp: unknown) => void): void
    onMessage: { addListener(l: (...a: unknown[]) => void): void }
    id: string
    lastError: undefined
  }
  history: {
    search(opts: unknown, cb: (items: unknown[]) => void): void
    getVisits(opts: unknown, cb: (visits: unknown[]) => void): void
  }
  bookmarks: {
    search(query: unknown, cb: (items: unknown[]) => void): void
    remove(id: string, cb?: () => void): void
  }
  alarms: {
    create(name: string, opts: unknown): void
    onAlarm: { addListener(l: (...a: unknown[]) => void): void }
    get(name: string, cb: (alarm: unknown) => void): void
    clear(name: string, cb?: (cleared: boolean) => void): void
  }
}

// In-memory storage map
const STORAGE = new Map<string, unknown>()
const LISTENERS = new Set<Listener>()

function notifyChange(key: string, newValue: unknown, oldValue: unknown) {
  for (const l of LISTENERS) {
    try {
      l({ [key]: { newValue, oldValue } }, 'local')
    } catch {}
  }
}

/** 注入 mock 数据到内存 storage */
export function injectMockData(data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    STORAGE.set(k, v)
  }
}

/** 重置 storage（切换 case 时调）*/
export function resetMockData() {
  STORAGE.clear()
}

const mockChrome: ChromeShim = {
  storage: {
    local: {
      get(keys, cb) {
        const result: Record<string, unknown> = {}
        if (keys == null) {
          // 全量
          for (const [k, v] of STORAGE) result[k] = v
        } else if (typeof keys === 'string') {
          if (STORAGE.has(keys)) result[keys] = STORAGE.get(keys)
        } else if (Array.isArray(keys)) {
          for (const k of keys) if (STORAGE.has(k)) result[k] = STORAGE.get(k)
        } else {
          // object with defaults
          for (const [k, def] of Object.entries(keys)) {
            result[k] = STORAGE.has(k) ? STORAGE.get(k) : def
          }
        }
        if (cb) cb(result)
        return Promise.resolve(result)
      },
      set(items, cb) {
        for (const [k, v] of Object.entries(items)) {
          const old = STORAGE.get(k)
          STORAGE.set(k, v)
          notifyChange(k, v, old)
        }
        if (cb) cb()
        return Promise.resolve()
      },
      remove(keys, cb) {
        const ks = Array.isArray(keys) ? keys : [keys]
        for (const k of ks) {
          const old = STORAGE.get(k)
          STORAGE.delete(k)
          notifyChange(k, undefined, old)
        }
        if (cb) cb()
        return Promise.resolve()
      },
      clear(cb) {
        STORAGE.clear()
        if (cb) cb()
        return Promise.resolve()
      },
      onChanged: {
        addListener(l) { LISTENERS.add(l) },
        removeListener(l) { LISTENERS.delete(l) },
      },
    },
    onChanged: {
      addListener(l) { LISTENERS.add(l) },
      removeListener(l) { LISTENERS.delete(l) },
    },
  },
  runtime: {
    getURL(path) { return path.startsWith('/') ? path : `/${path}` },
    sendMessage(_msg, cb) {
      // preview 工具不真发消息，直接回 null
      if (cb) cb(null)
    },
    onMessage: { addListener() {} },
    id: 'chord-preview',
    lastError: undefined,
  },
  history: {
    // visitCounts 由 mock data 直接提供（chord_history key），这里返回空
    search(_opts, cb) { cb([]) },
    getVisits(_opts, cb) { cb([]) },
  },
  bookmarks: {
    search(_q, cb) { cb([]) },
    remove(_id, cb) { if (cb) cb() },
  },
  alarms: {
    create() {},
    onAlarm: { addListener() {} },
    get(_n, cb) { cb(null) },
    clear(_n, cb) { if (cb) cb(false) },
  },
}

// 注入到 window
;(globalThis as unknown as { chrome: ChromeShim }).chrome = mockChrome
