export const convertRotationToMatrix = (degrees: number): number[] => {
  const rad = (degrees * Math.PI) / 180
  return [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad)]
}
