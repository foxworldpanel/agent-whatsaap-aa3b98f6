import { fetch } from 'undici';

async function listModels() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  console.log("Fetching models from Anthropic API...");
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });

    const status = response.status;
    const requestId = response.headers.get("request-id");
    const data = await response.json() as any;

    console.log(`HTTP Status: ${status}`);
    console.log(`Request ID: ${requestId}`);

    if (status === 200) {
      console.log(`Model Count: ${data.data?.length || 0}`);
      console.log("Models Available:");
      data.data?.forEach((m: any) => {
        console.log(`- ID: ${m.id} | Name: ${m.display_name} | Created: ${m.created_at}`);
      });
    } else {
      console.error("Error Response:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

listModels();
