/** Stable model colors, independent of provider, day, row order, and mix metric. */
const MODEL_COLORS: Record<string, string> = {
  sonnet: '#e07824',
  opus: '#cf397c',
  fable: '#8854d0',
  haiku: '#b7502d',
  luna: '#2888d8',
  sol: '#249764',
  terra: '#b88b18',
  '6-astra': '#17a4ac',
  spark: '#e6b422',
  'composer-2.5': '#70849d',
  default: '#96979d',
  flash: '#c95f4a',
  glm: '#56a347',
  kimi: '#ad669a',
  'gemma4-31b': '#587ab9',
  'qwen3.8-flash': '#9e9243',
  'qwen3.8-max': '#578a80',
  '4.5': '#bf604e',
  '4.5b': '#c76889',
  '4.6': '#a65047',
  '4.6b': '#c7663a',
  '4.7': '#b14360',
  '4.7b': '#db5055',
  '4.7-build-fast': '#dd9360',
  '5.5': '#468ca2',
  '3.8-flash': '#a1a041',
  'mercury-2': '#917553',
  'mercury-2.5': '#6c9c75',
  'nex-agi/nex-n2.5-pro': '#ba7354',
  'stealth/union-alpha': '#8e81aa',
  'xiaomi/mimo-v2.6-pro': '#53958f',
};

export function modelColor(model: string): string {
  const key = model.trim().toLowerCase();
  if (MODEL_COLORS[key]) return MODEL_COLORS[key];
  // New model names receive a deterministic color without recoloring existing names.
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `hsl(${hash % 360} ${(hash % 17) + 52}% ${(hash % 11) + 44}%)`;
}
