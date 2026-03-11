const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_NAME = "gemini-embedding-2-preview";

function buildEndpoint(apiKey) {
  const url = new URL(`${API_ROOT}/models/${MODEL_NAME}:embedContent`);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

export async function embedText({ apiKey, text, outputDimensionality = 3072, taskType = "RETRIEVAL_DOCUMENT" }) {
  const response = await fetch(buildEndpoint(apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: `models/${MODEL_NAME}`,
      content: {
        role: "user",
        parts: [{ text }]
      },
      taskType,
      outputDimensionality
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const values = payload.embedding?.values;

  if (!values?.length) {
    throw new Error("Embedding API returned an empty vector.");
  }

  return values;
}

export async function verifyApiKey(apiKey) {
  await embedText({
    apiKey,
    text: "API key verification for vector search demo.",
    outputDimensionality: 16,
    taskType: "RETRIEVAL_QUERY"
  });
}
