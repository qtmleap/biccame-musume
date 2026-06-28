declare module 'virtual:public-characters' {
  const data: unknown[]
  export default data
}

declare module '*.wasm' {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}
