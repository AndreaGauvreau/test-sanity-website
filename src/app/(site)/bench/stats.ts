export const RUNS = 5

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export const formatMs = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`

export const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} o`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} Ko`
      : `${(bytes / 1024 / 1024).toFixed(2)} Mo`
