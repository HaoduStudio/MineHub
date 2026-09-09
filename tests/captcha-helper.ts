import { solve_pow } from "@cap.js/wasm/node/cap_wasm"

// Cap's public compact challenge format derives puzzle salts using FNV-1a/xorshift.
function prng(seed: string, length: number) {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619) >>> 0
  }
  let value = ""
  while (value.length < length) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    value += (state >>> 0).toString(16).padStart(8, "0")
  }
  return value.slice(0, length)
}

export function solveCaptcha(input: {
  token: string
  challenge: { c: number; s: number; d: number }
}) {
  const { token, challenge } = input
  return {
    token,
    solutions: Array.from({ length: challenge.c }, (_, i) =>
      Number(
        solve_pow(
          prng(`${token}${i + 1}`, challenge.s),
          prng(`${token}${i + 1}d`, challenge.d)
        )
      )
    ),
  }
}
