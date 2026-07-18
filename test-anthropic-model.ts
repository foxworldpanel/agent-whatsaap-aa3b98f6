
import fetch from "node-fetch";

async function testModel() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("ANTHROPIC_API_KEY not found in environment");
    process.exit(1);
  }

  const modelId = "claude-sonnet-5";
  console.log(`Testing model: ${modelId}...`);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (res.ok) {
      const json = await res.json();
      console.log("Success! Response received.");
      console.log(JSON.stringify(json, null, 2));
    } else {
      const text = await res.text();
      console.error(`Error: ${res.status}`);
      console.error(text);
    }
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

testModel();
