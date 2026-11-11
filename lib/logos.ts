/**
 * Technology marks for the sketch. Everything comes from Simple Icons, drawn in ink so
 * the palette still means role and link kind. Unknown names simply render no mark.
 */
const SLUGS: Record<string, string> = {
  "next.js": "nextdotjs",
  nextjs: "nextdotjs",
  "node.js": "nodedotjs",
  nodejs: "nodedotjs",
  node: "nodedotjs",
  postgres: "postgresql",
  postgresql: "postgresql",
  aws: "amazonwebservices",
  "amazon web services": "amazonwebservices",
  gcp: "googlecloud",
  "google cloud": "googlecloud",
  k8s: "kubernetes",
  mongo: "mongodb",
  react: "react",
  "react native": "react",
  swiftui: "swift",
  uikit: "swift",
  appkit: "apple",
  macos: "apple",
  ios: "apple",
  tailwind: "tailwindcss",
  "tailwind css": "tailwindcss",
  vue: "vuedotjs",
  nuxt: "nuxt",
  sveltekit: "svelte",
  express: "express",
  spring: "spring",
  dotnet: "dotnet",
  ".net": "dotnet",
  "c#": "sharp",
  "c++": "cplusplus",
  go: "go",
  golang: "go",
  java: "openjdk",
  rails: "rubyonrails",
  "ruby on rails": "rubyonrails",
  "sql server": "microsoftsqlserver",
  "aws s3": "amazons3",
  s3: "amazons3",
  sqs: "amazonsqs",
  kafka: "apachekafka",
  sendgrid: "twilio",
};

export function logoUrl(tech?: string): string | null {
  const key = (tech ?? "").trim().toLowerCase();
  if (!key) return null;
  const slug = SLUGS[key] ?? key.replace(/[^a-z0-9]/g, "");
  if (!slug) return null;
  return `https://cdn.simpleicons.org/${slug}/0a0a0a`;
}
