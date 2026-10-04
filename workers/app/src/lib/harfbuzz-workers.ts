/**
 * satori standalone が import する `harfbuzzjs` の Workers 向け置換。
 *
 * 既定の harfbuzzjs は hb.wasm を fs / XMLHttpRequest / self.location から探すため、
 * Workers では初期化時に TypeError になる。ビルド時に WebAssembly.Module として同梱した
 * hb.wasm を emscripten の instantiateWasm フックへ渡し、外部取得を行わない。
 */

import createHarfBuzz from 'harfbuzzjs/hb.js'
import hbWasmModule from 'harfbuzzjs/hb.wasm'
import hbjs from 'harfbuzzjs/hbjs.js'

const load = async (): Promise<unknown> => {
  // emscriptenはWorker環境と判定するとself.location.hrefを読む。workerdには無いため初期化中だけ補う。
  const scope = globalThis as { self?: { location?: { href: string } } }
  const added = scope.self !== undefined && scope.self.location === undefined
  if (added && scope.self) scope.self.location = { href: 'https://workers.invalid/' }
  // nodejs_compatがprocess.versions.nodeを返すと、emscriptenはfsでWASMを読もうとする。
  // 初期化中だけNode判定を外し、同梱WASMのフックだけを使わせる。
  const runtime = globalThis as { process?: { versions?: Record<string, string | undefined> } }
  const versions = runtime.process?.versions
  const node = versions?.node
  if (versions && node !== undefined) delete versions.node
  try {
    const module = await createHarfBuzz({
      // emscripten は受け取り関数を (instance, module) の順で呼ぶ。
      instantiateWasm: (imports, receive) => {
        void WebAssembly.instantiate(hbWasmModule, imports).then((instance) => receive(instance, hbWasmModule))
        return {}
      }
    })
    return hbjs(module)
  } finally {
    if (added && scope.self) delete scope.self.location
    if (versions && node !== undefined) versions.node = node
  }
}

export default load()
