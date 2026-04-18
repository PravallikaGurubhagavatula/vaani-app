const BHASHINI_ENDPOINT = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";
const GOOGLE_ENDPOINT = "https://translation.googleapis.com/v3/projects";
const INDICTRANS_ENDPOINT = "https://api-inference.huggingface.co/models/ai4bharat/indictrans2-indic-indic-1B";

function withTimeout(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { controller, timeoutId };
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function protectEntities(text) {
  const tokens = [];
  let index = 0;
  const protectedText = String(text || "").replace(/(@[\w._-]+|https?:\/\/\S+|[\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu, (match) => {
    const token = `__VAANI_TOKEN_${index}__`;
    tokens.push({ token, value: match });
    index += 1;
    return token;
  });
  return { protectedText, tokens };
}

function restoreEntities(text, tokens) {
  return (tokens || []).reduce((acc, item) => acc.replaceAll(item.token, item.value), String(text || ""));
}

async function callBhashiniTranslate(inputText, sourceCode, targetCode, contextMessages, mode) {
  const apiKey = process.env.REACT_APP_BHASHINI_API_KEY;
  const userId = process.env.REACT_APP_BHASHINI_USER_ID;
  if (!apiKey || !userId || !targetCode) return null;

  const taskType = mode === "transliterate" ? "transliteration" : "translation";
  const payload = {
    pipelineTasks: [{
      taskType,
      config: {
        language: {
          sourceLanguage: sourceCode || "hi",
          targetLanguage: targetCode
        },
        modelConfig: {
          decodingStrategy: "NMT"
        }
      }
    }],
    inputData: {
      input: [{
        source: inputText,
        context: Array.isArray(contextMessages) ? contextMessages.slice(-2) : []
      }]
    }
  };

  const { controller, timeoutId } = withTimeout(10000);
  try {
    const response = await fetch(BHASHINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey,
        "x-api-key": apiKey,
        "userID": userId,
        "ulcaApiKey": apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.pipelineResponse?.[0]?.output?.[0]?.target || null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGoogleTranslate(inputText, sourceCode, targetCode, mode) {
  const apiKey = process.env.REACT_APP_GOOGLE_TRANSLATE_API_KEY;
  const projectId = process.env.GOOGLE_TRANSLATE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!apiKey || !projectId || !targetCode || mode === "transliterate") return null;

  const { controller, timeoutId } = withTimeout(10000);
  try {
    const response = await fetch(`${GOOGLE_ENDPOINT}/${projectId}/locations/global:translateText?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [inputText],
        targetLanguageCode: targetCode,
        sourceLanguageCode: sourceCode || "auto"
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.translations?.[0]?.translatedText || null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callIndicTrans(inputText, sourceCode, targetCode, mode) {
  const apiKey = process.env.REACT_APP_HUGGINGFACE_API_KEY;
  if (!apiKey || !targetCode || mode === "transliterate") return null;

  const { controller, timeoutId } = withTimeout(10000);
  try {
    const response = await fetch(INDICTRANS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: inputText,
        parameters: {
          src_lang: sourceCode || "hi",
          tgt_lang: targetCode,
          preserve_formatting: true
        },
        options: { wait_for_model: true }
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data[0] && typeof data[0].translation_text === "string") {
      return data[0].translation_text;
    }
    if (typeof data?.generated_text === "string") return data.generated_text;
    return null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleTranslate(req, res) {
  try {
    if (req.method !== "POST") return jsonResponse(res, 405, { result: null, error: "Method not allowed" });

    const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const text = String(body.text || "");
    const targetLanguage = String(body.targetLanguage || "English");
    const mode = String(body.mode || "translate");
    const sourceLanguage = String(body.sourceLanguage || "hi");
    const contextMessages = Array.isArray(body.contextMessages) ? body.contextMessages.slice(-2).map(String) : [];

    if (!text.trim()) return jsonResponse(res, 200, { result: text, detectedLanguage: sourceLanguage, apiUsed: "none" });

    const targetBhashini = String(body.targetBhashiniCode || "");
    const targetGoogle = String(body.targetGoogleCode || "");
    if (!targetBhashini && !targetGoogle) {
      return jsonResponse(res, 200, { result: text, detectedLanguage: sourceLanguage, apiUsed: "none" });
    }

    if (sourceLanguage === targetGoogle && mode === "translate") {
      return jsonResponse(res, 200, { result: text, detectedLanguage: sourceLanguage, apiUsed: "none" });
    }

    const { protectedText, tokens } = protectEntities(text);

    let result = await callBhashiniTranslate(protectedText, sourceLanguage, targetBhashini, contextMessages, mode);
    let apiUsed = result ? "bhashini" : "";

    if (!result && mode === "translate") {
      result = await callGoogleTranslate(protectedText, sourceLanguage, targetGoogle, mode);
      if (result) apiUsed = "google";
    }

    if (!result && mode === "translate") {
      result = await callIndicTrans(protectedText, sourceLanguage, targetGoogle || targetBhashini, mode);
      if (result) apiUsed = "indictrans2";
    }

    if (!result && mode === "transliterate") {
      result = text;
      apiUsed = "fallback";
    }

    if (!result) {
      return jsonResponse(res, 200, { result: text, detectedLanguage: sourceLanguage, apiUsed: "fallback", unavailable: true });
    }

    return jsonResponse(res, 200, {
      result: restoreEntities(result, tokens),
      detectedLanguage: sourceLanguage,
      apiUsed
    });
  } catch (err) {
    return jsonResponse(res, 200, { result: null, detectedLanguage: "hi", apiUsed: "error" });
  }
}

module.exports = { handleTranslate };
