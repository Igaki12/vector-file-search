const DEFAULT_SEGMENT_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

export function splitTextIntoSegments(text, size = DEFAULT_SEGMENT_SIZE, overlap = DEFAULT_OVERLAP) {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  const segments = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + size, normalized.length);
    const segment = normalized.slice(start, end).trim();

    if (segment) {
      segments.push(segment);
    }

    if (end === normalized.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return segments;
}

function normalizeText(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function cosineSimilarity(a, b) {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }

  if (!aNorm || !bNorm) {
    return 0;
  }

  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function lexicalScore(query, text) {
  const normalizedQuery = normalizeText(query);
  const normalizedText = normalizeText(text);

  if (!normalizedQuery || !normalizedText) {
    return 0;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const exact = normalizedText.includes(normalizedQuery) ? 1 : 0;
  const tokenHits = tokens.filter((token) => normalizedText.includes(token)).length;
  const coverage = tokens.length ? tokenHits / tokens.length : 0;

  return Math.min(1, exact * 0.6 + coverage * 0.4);
}

export function combinedScore(query, text, queryVector, itemVector) {
  const semantic = (cosineSimilarity(queryVector, itemVector) + 1) / 2;
  const lexical = lexicalScore(query, text);
  const finalScore = semantic * 0.8 + lexical * 0.2;

  return {
    semantic,
    lexical,
    finalScore
  };
}

export function summarizeText(text, maxLength = 180) {
  const compact = text.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength).trim()}...`;
}
