import OpenAI from "openai";
const c = new OpenAI({ baseURL: "https://api.reflection.ai/openai/v1", apiKey: process.env.REFLECTION_API_KEY });
const schema = { type: "object", properties: { city: { type: "string" }, country: { type: "string" } }, required: ["city","country"], additionalProperties: false };
const tools = [{ type: "function", function: { name: "get_weather", description: "Get weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }];
const messages = [
  { role: "system", content: "Use the tool to look up the weather, then answer as JSON." },
  { role: "user", content: "Weather in Paris?" },
];
for (let i = 0; i < 4; i++) {
  const r = await c.chat.completions.create({
    model: "Beam-1.0-501B-A23B", messages, tools, tool_choice: "auto",
    response_format: { type: "json_schema", json_schema: { name: "answer", schema } },
    reasoning_effort: "low", max_completion_tokens: 3000,
  });
  const m = r.choices[0].message;
  console.log("round", i, "finish:", r.choices[0].finish_reason, "| keys:", Object.keys(m));
  if (r.choices[0].finish_reason === "tool_calls") {
    messages.push(m);
    for (const tc of m.tool_calls ?? []) {
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ tempC: 21, note: "sunny" }) });
    }
    continue;
  }
  console.log("content:", m.content);
  break;
}
