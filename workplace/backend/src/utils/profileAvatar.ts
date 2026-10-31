const avatarColors = ['#5149D6', '#007F86', '#B54708', '#A1265E', '#276749', '#3157A4']

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (const character of seed) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return hash >>> 0
}

export function createProfileAvatar(seed: string): string {
  const hash = hashSeed(seed)
  const color = avatarColors[hash % avatarColors.length]
  const cells: string[] = []

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cellHash = hashSeed(`${seed}:${row}:${column}`)
      if (cellHash % 3 === 0) continue

      const x = column === 2 ? column : 4 - column
      cells.push(
        `<rect x="${x * 20 + 4}" y="${row * 20 + 4}" width="16" height="16" rx="5" fill="${color}"/>`
      )
      if (column < 2) {
        cells.push(
          `<rect x="${column * 20 + 4}" y="${row * 20 + 4}" width="16" height="16" rx="5" fill="${color}"/>`
        )
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="28" fill="#FFFFFF"/>${cells.join('')}</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function isGeneratedProfileAvatar(picture?: string): boolean {
  return picture?.startsWith('data:image/svg+xml;charset=UTF-8,') ?? false
}
