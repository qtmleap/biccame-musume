// ビューワ API のスキーマは管理画面（workers/app）からも使うため packages/shared にある。
// scripts 側の import 先を変えずに済むよう、ここから再エクスポートする。
export * from '@biccame/shared/event-detect/viewer'
