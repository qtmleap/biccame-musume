declare module 'virtual:public-characters' {
  const data: unknown[]
  export default data
}

declare module '*.wasm' {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}

declare module 'harfbuzzjs/hb.js' {
  type EmscriptenOptions = {
    instantiateWasm: (
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void
    ) => object
  }
  const createHarfBuzz: (options: EmscriptenOptions) => Promise<unknown>
  export default createHarfBuzz
}

declare module 'harfbuzzjs/hbjs.js' {
  const hbjs: (module: unknown) => unknown
  export default hbjs
}
