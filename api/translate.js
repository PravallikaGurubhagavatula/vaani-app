export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, source, target } = req.body;

    const response = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: text,
        source_language_code: source || "en",
        target_language_code: target
      })
    });

    const data = await response.json();

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
