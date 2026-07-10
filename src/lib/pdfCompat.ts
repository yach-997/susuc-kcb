/**
 * pdfjs-dist 5.4+ / 6.x 依赖较新的 JS API。
 * 国产手机自带浏览器 / 旧 WebView 常缺这些方法，必须补齐。
 */
export function installPdfCompat(): void {
  const u8 = Uint8Array.prototype as Uint8Array & {
    toHex?: () => string
    toBase64?: () => string
  }
  if (typeof u8.toHex !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      value(this: Uint8Array) {
        let hex = ''
        for (let i = 0; i < this.length; i++) {
          hex += this[i]!.toString(16).padStart(2, '0')
        }
        return hex
      },
      writable: true,
      configurable: true,
    })
  }
  if (typeof u8.toBase64 !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      value(this: Uint8Array) {
        const chunk = 0x8000
        let binary = ''
        for (let i = 0; i < this.length; i += chunk) {
          binary += String.fromCharCode(
            ...this.subarray(i, Math.min(i + chunk, this.length)),
          )
        }
        return btoa(binary)
      },
      writable: true,
      configurable: true,
    })
  }

  const mapProto = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: (
      key: unknown,
      cb: (key: unknown) => unknown,
    ) => unknown
    getOrInsert?: (key: unknown, defaultValue: unknown) => unknown
  }
  if (typeof mapProto.getOrInsertComputed !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
      value(
        this: Map<unknown, unknown>,
        key: unknown,
        callbackFn: (key: unknown) => unknown,
      ) {
        if (this.has(key)) return this.get(key)
        const value = callbackFn(key)
        this.set(key, value)
        return value
      },
      writable: true,
      configurable: true,
    })
  }
  if (typeof mapProto.getOrInsert !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsert', {
      value(this: Map<unknown, unknown>, key: unknown, defaultValue: unknown) {
        if (this.has(key)) return this.get(key)
        this.set(key, defaultValue)
        return defaultValue
      },
      writable: true,
      configurable: true,
    })
  }

  const PromiseAny = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason?: unknown) => void
    }
  }
  if (typeof PromiseAny.withResolvers !== 'function') {
    PromiseAny.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }

  // Array.prototype.at — 部分旧机没有
  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value(this: unknown[], index: number) {
        const n = Math.trunc(index) || 0
        const i = n >= 0 ? n : this.length + n
        return this[i]
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value(obj: object, prop: PropertyKey) {
        return Object.prototype.hasOwnProperty.call(obj, prop)
      },
      writable: true,
      configurable: true,
    })
  }
}
