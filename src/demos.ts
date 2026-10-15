export type DemoKind = 'basic' | 'palette' | 'unicode' | 'anim'

type DemoApp = {
  clearScreen: () => void
  sendInput: (text: string) => void
}

function joinLines(lines: string[]) {
  return lines.join('\r\n')
}

function demoBasic() {
  const lines = [
    'terminal demo: basics',
    '',
    'Styles: ' +
      '\x1b[1mBold\x1b[0m ' +
      '\x1b[3mItalic\x1b[0m ' +
      '\x1b[4mUnderline\x1b[0m ' +
      '\x1b[7mReverse\x1b[0m ' +
      '\x1b[9mStrike\x1b[0m',
    '',
    'RGB: ' +
      '\x1b[38;2;255;100;0mOrange\x1b[0m ' +
      '\x1b[38;2;120;200;255mSky\x1b[0m ' +
      '\x1b[38;2;160;255;160mMint\x1b[0m',
    'BG:  ' +
      '\x1b[48;2;60;60;60m  \x1b[0m ' +
      '\x1b[48;2;120;40;40m  \x1b[0m ' +
      '\x1b[48;2;40;120;40m  \x1b[0m ' +
      '\x1b[48;2;40;40;120m  \x1b[0m',
    '',
    'Box: \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510',
    '     \u2502  mono renderer     \u2502',
    '     \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518',
    '',
  ]
  return `\x1b[2J\x1b[H${joinLines(lines)}`
}

function demoPalette() {
  const lines = ['terminal demo: palette', '']
  const blocks: string[] = []
  for (let i = 0; i < 16; i += 1) {
    blocks.push(`\x1b[48;5;${i}m  \x1b[0m`)
  }
  lines.push(`Base 16: ${blocks.join(' ')}`)
  lines.push('')
  for (let row = 0; row < 6; row += 1) {
    const rowBlocks: string[] = []
    for (let col = 0; col < 12; col += 1) {
      const idx = 16 + row * 12 + col
      rowBlocks.push(`\x1b[48;5;${idx}m  \x1b[0m`)
    }
    lines.push(rowBlocks.join(''))
  }
  lines.push('')
  const gray: string[] = []
  for (let i = 232; i <= 255; i += 1) {
    gray.push(`\x1b[48;5;${i}m \x1b[0m`)
  }
  lines.push(`Grayscale: ${gray.join('')}`)
  lines.push('')
  return `\x1b[2J\x1b[H${joinLines(lines)}`
}

function demoUnicode() {
  const lines = [
    'terminal demo: unicode',
    '',
    'Arrows: \u2190 \u2191 \u2192 \u2193  \u2196 \u2197 \u2198 \u2199',
    'Math:   \u2211 \u221a \u221e \u2248 \u2260 \u2264 \u2265',
    'Blocks: \u2591 \u2592 \u2593 \u2588 \u258c \u2590 \u2580 \u2584',
    'Lines:  \u2500 \u2502 \u250c \u2510 \u2514 \u2518 \u251c \u2524 \u252c \u2534 \u253c',
    'Braille: \u280b\u2819\u2839\u283c\u2834\u2826\u2827\u2807\u280f',
    '',
  ]
  return `\x1b[2J\x1b[H${joinLines(lines)}`
}

export function createDemoController(app: DemoApp) {
  let timer = 0

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = 0
    }
  }

  const startAnimation = () => {
    stop()
    app.clearScreen()
    const start = performance.now()
    let tick = 0
    timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = (now - start) / 1000
      const spinner = ['|', '/', '-', '\\'][tick % 4]
      const barWidth = Math.max(10, Math.min(60, 80 - 20))
      const phase = (Math.sin(elapsed * 1.6) + 1) * 0.5
      const fill = Math.floor(barWidth * phase)
      const bar = '\u2588'.repeat(fill) + ' '.repeat(Math.max(0, barWidth - fill))
      const lines = [
        `terminal demo: animation ${spinner}`,
        '',
        `time ${elapsed.toFixed(2)}s`,
        `progress [${bar}]`,
        '',
        'palette:',
        `  \x1b[38;5;45mcyan\x1b[0m \x1b[38;5;202morange\x1b[0m \x1b[38;5;118mgreen\x1b[0m \x1b[38;5;213mpink\x1b[0m`,
        '',
        'type to echo input below...',
        '',
      ]
      app.sendInput(`\x1b[H\x1b[J${joinLines(lines)}`)
      tick += 1
    }, 80)
  }

  const run = (kind: DemoKind | string) => {
    stop()
    switch (kind) {
      case 'palette':
        app.sendInput(demoPalette())
        break
      case 'unicode':
        app.sendInput(demoUnicode())
        break
      case 'anim':
        startAnimation()
        break
      case 'basic':
      default:
        app.sendInput(demoBasic())
        break
    }
  }

  return { run, stop }
}
