import { fetch } from 'undici';

async function testCall() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = "claude-haiku-4-5-20251001";
  
  console.log(`Testing model: ${model}`);
  
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 100,
        messages: [
          { role: "user", content: "Responda apenas: teste funcionando" }
        ]
      })
    });

    const status = response.status;
    const data = await response.json() as any;
    
    console.log(`HTTP Status: ${status}`);
    console.log(`Request ID: ${response.headers.get("request-id")}`);
    
    if (status === 200) {
      console.log("Response:", data.content[0].text);
      console.log("Usage:", JSON.stringify(data.usage));
    } else {
      console.error("Error:", JSON.stringify(data.error));
    }
  } catch (error) {
    console.error("Failed:", error);
  }
}

testCall();
