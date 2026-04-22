export default async function handler(req, res) {
  try {
    const { text, source, target } = req.body;

    const response = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.sk_l241zl9n_aA223rcvg5j5bdf1unIS24kN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: text,
        source_language: source,
        target_language: target
      })
    });

    const data = await response.json();

    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
