import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

/** Ornamental “glyphs” (not prose): spaced so Pretext keeps most as separate measured segments. */
const ORNAMENT_CHARS =
  '■□▢▣▤▥▦▧▨▩▪▫▬▭▮▯▰▱▲△▴▵▶▷◀◁◂◃◄◅◆◇◈◉◊○◎●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡☀☁☂☃★☆☎☏☐☑☒☓☔☕☖☗♔♕♖♗♘♙♚♛♜♝♞♟♠♣♥♦♩♪♫♬⚊⚋⛁⛂⛛⛶✦✧❖❘❙❚⬒⬓⬔⬕⬖⬗⬘⬙⬚⬛⬜⬝⬞⬟⬠⬡⬢⬣⬤⬥⬦⬧'

const REPEAT = 12

export const SKIN_FONT =
  '22px "Segoe UI Symbol", "Cascadia Code", "Noto Sans Symbols 2", sans-serif'

export function buildSkinStream(): string {
  const units = [...ORNAMENT_CHARS]
  const chunks: string[] = []
  for (let r = 0; r < REPEAT; r++) {
    for (let i = 0; i < units.length; i++) {
      chunks.push(units[i]!)
      chunks.push(' ')
    }
  }
  return chunks.join('')
}

let cached: PreparedTextWithSegments | null = null

export function getPreparedSkin(): PreparedTextWithSegments {
  if (cached === null) {
    cached = prepareWithSegments(buildSkinStream(), SKIN_FONT)
  }
  return cached
}

export function seedCursor(prepared: PreparedTextWithSegments, advance: number): LayoutCursor {
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  for (let i = 0; i < advance; i++) {
    const line = layoutNextLine(prepared, cursor, 400)
    if (line === null) {
      cursor = { segmentIndex: 0, graphemeIndex: 0 }
      continue
    }
    cursor = line.end
  }
  return cursor
}
