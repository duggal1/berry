import OpenAI from "openai";
const c = new OpenAI({ baseURL: "https://api.reflection.ai/openai/v1", apiKey: process.env.REFLECTION_API_KEY });
const schema = { type: "object", properties: { city: { type: "string" }, country: { type: "string" } }, required: ["city","country"], additionalProperties: false };
const tools = [{ type: "function", function: { name: "get_weather", description: "Get weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }];
try {
  const r = await c.chat.completions.create({
    model: "Beam-1.0-501B-A23B",
    messages: [
      { role: "system", content: "Use the tool to look up the weather, then answer as JSON with city and country." },
      { role: "user", content: "Weather in Paris?" },
    ],
    tools, tool_choice: "auto",
    response_format: { type: "json_schema", json_schema: { name: "answer", schema } },
    reasoning_effort: "low",
    max_completion_tokens: 3000,
  });
  console.log("finish:", r.choices[0].finish_reason);
  console.log("content:", r.choices[0].message.content);
  console.log("tool_calls:", JSON.stringify(r.choices[0].message.tool_calls));
  console.log("reasoning:", r.choices[0].message.reasoning_content?.slice(0,120));
} catch (e) { console.log("ERR", e.status, e.message?.slice(0,500)); }
