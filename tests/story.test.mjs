import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisCore, fromLegacyAnalysis } from "../lib/schema.ts";
import { scan } from "../server/scan.ts";
import { verify } from "../server/verify.ts";

const SHA = "cbc25b19270a875f104598f58875be7a4bdbfa29";

const sources = {
  "app/job-post/new/page.tsx": [
    'import { auth } from "@/lib/auth";',
    'import { getMyCompany } from "@/lib/actions/company";',
    'import { JobPostForm } from "@/components/job-post-form";',
    "const session = await auth.api.getSession({ headers: await headers() });",
    'redirect("/sign-in");',
    "const company = await getMyCompany(session);",
    "if (!company?.onboardedAt) {",
    'redirect("/onboarding");',
    '<JobPostForm companyId={session.user.id} />',
  ],
  "lib/auth.ts": ['export const auth = betterAuth({'],
  "lib/actions/company.ts": ["export async function getMyCompany(session: NonNullable<"],
  "components/job-post-form.tsx": [
    'import { saveJob } from "@/lib/actions/save-job";',
    "const result = jobPostSchema.safeParse(value);",
    "queryClient.setQueryData<JobCardData[]>(jobsKeys.latest(), (old) =>",
    "saveJob({ company, jobPost }),",
    "queryClient.invalidateQueries({ queryKey: jobsKeys.all });",
    "router.refresh();",
    "router.push(`/company/${jobPostId}/${companySlug}`);",
  ],
  "lib/actions/save-job.ts": [
    'import { getDb, getHttpDb } from "@/lib/db";',
    'import { bust } from "@/lib/db/memo";',
    'import { publishRealtime } from "@/lib/realtime/bus";',
    'import { revalidatePath } from "next/cache";',
    'import { after } from "next/server";',
    'import { auth } from "@/lib/auth";',
    'import { embedText } from "@/lib/embeddings";',
    'import { upsertJobVector, buildJobText } from "@/lib/pinecone";',
    "const session = await auth.api.getSession({ headers: await headers() });",
    "const db = getDb();",
    "const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, company.slug)).limit(1);",
    "const batchDb = getHttpDb();",
    "await batchDb.batch([",
    'bust("latestJobs");',
    'revalidatePath("/", "page");',
    'publishRealtime({ type: "jobs", jobPostId });',
    "after(async () => {",
    "const vector = await embedText(buildJobText(jobPost));",
    "await upsertJobVector(jobPostId, vector, {",
    'console.error("[pinecone] failed to index job", jobPostId, error);',
    "return { id: jobPostId, slug: jobPost.companySlug };",
    "export async function saveJob({ company, jobPost }: { company: Company; jobPost: JobPost }) {",
    "const companyId = existing?.id ?? session.user.id;",
  ],
  "lib/db/index.ts": ["export function getDb() {", "export function getHttpDb() {"],
  "lib/db/memo.ts": ["export function bust(prefix: string) {"],
  "lib/realtime/bus.ts": ["listener(event);", "export function publishRealtime(event: RealtimeEvent) {"],
  "app/api/realtime/route.ts": [
    "unsubscribe = subscribeRealtime(send);",
    "return new Response(stream, {",
  ],
  "components/realtime-provider.tsx": [
    'source = new EventSource("/api/realtime");',
    "void queryClient.invalidateQueries({ queryKey: jobsKeys.all });",
  ],
  "lib/embeddings.ts": ["export async function embedText(text: string): Promise<number[]> {"],
  "lib/pinecone.ts": [
    "export function buildJobText(job: {",
    "export async function upsertJobVector(",
  ],
};

const files = new Map(Object.entries(sources).map(([path, lines]) => [path, lines.join("\n")]));
const repo = { repo: "duggal1/ai-job-software", sha: SHA, files };
const facts = scan(repo.repo, repo.sha, files);

const makeModule = (id, name, role, kind, path, moduleFiles) => ({
  id, name, role, kind, path, files: moduleFiles, group: "Job posting", purpose: `${name} responsibility.`,
});

const modules = [
  makeModule("job-post-page", "Job post page", "entry", "service", "app/job-post/new", ["app/job-post/new/page.tsx"]),
  makeModule("auth-service", "Authentication", "integration", "service", "lib", ["lib/auth.ts"]),
  makeModule("company-action", "Company lookup", "core", "service", "lib/actions", ["lib/actions/company.ts"]),
  makeModule("job-post-form", "Job post form", "entry", "service", "components", ["components/job-post-form.tsx"]),
  makeModule("save-job-action", "Save job action", "core", "service", "lib/actions", ["lib/actions/save-job.ts"]),
  makeModule("database-client", "Database client", "data", "datastore", "lib/db", ["lib/db/index.ts"]),
  makeModule("memo-cache", "Memo cache", "utility", "service", "lib/db", ["lib/db/memo.ts"]),
  makeModule("route-cache", "Framework route cache", "utility", "external", "external", []),
  makeModule("realtime-bus", "Realtime bus", "integration", "queue", "lib/realtime", ["lib/realtime/bus.ts"]),
  makeModule("realtime-route", "Realtime SSE route", "integration", "service", "app/api/realtime", ["app/api/realtime/route.ts"]),
  makeModule("realtime-client", "Realtime browser client", "utility", "service", "components", ["components/realtime-provider.tsx"]),
  makeModule("embedding-client", "Embedding client", "integration", "service", "lib", ["lib/embeddings.ts"]),
  makeModule("pinecone-search", "Pinecone index", "integration", "service", "lib", ["lib/pinecone.ts"]),
];

const edge = (id, from, to, kind, path, snippet, inferred = false) => ({
  id, from, to, kind, label: id.replaceAll("-", " "), inferred, evidence: { path, snippet },
});
const edges = [
  edge("page-auth", "job-post-page", "auth-service", "call", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][3], true),
  edge("page-company", "job-post-page", "company-action", "call", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][5]),
  edge("page-form-import", "job-post-page", "job-post-form", "import", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][2]),
  edge("form-save", "job-post-form", "save-job-action", "call", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][3]),
  edge("save-auth", "save-job-action", "auth-service", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][8], true),
  edge("save-database", "save-job-action", "database-client", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][9]),
  edge("save-memo", "save-job-action", "memo-cache", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][13]),
  edge("save-route-cache", "save-job-action", "route-cache", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][14], true),
  edge("save-realtime", "save-job-action", "realtime-bus", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][15]),
  edge("bus-sse", "realtime-bus", "realtime-route", "event", "lib/realtime/bus.ts", sources["lib/realtime/bus.ts"][0], true),
  edge("sse-client", "realtime-route", "realtime-client", "event", "app/api/realtime/route.ts", sources["app/api/realtime/route.ts"][1], true),
  edge("save-embedding", "save-job-action", "embedding-client", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][17]),
  edge("save-pinecone", "save-job-action", "pinecone-search", "call", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][18]),
  edge("save-return", "save-job-action", "job-post-form", "data", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][20], true),
];

const cite = (moduleId, path, snippet) => ({ moduleId, path, snippet });
const scene = (id, title, caption, kind, dependsOn, actions, evidence, parallelGroup, branchMode) => ({
  id, title, caption, kind, dependsOn, actions, evidence,
  ...(parallelGroup ? { parallelGroup } : {}),
  ...(branchMode ? { branchMode } : {}),
});
const story = {
  scenes: [
    scene("session-check", "Check the session", "The page resolves the session before it shows the job form.", "spine", [], [
      { kind: "enter", moduleId: "job-post-page" }, { kind: "traverse", edgeId: "page-auth" },
      { kind: "fork", mode: "exclusive", branchSceneIds: ["sign-in-redirect", "company-check"] },
    ], [cite("job-post-page", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][3])]),
    scene("sign-in-redirect", "Unauthenticated requests redirect", "Without a session, the page redirects to sign-in and never enters the successful save path.", "failure", ["session-check"], [
      { kind: "enter", moduleId: "job-post-page" }, { kind: "outcome", result: "failure", text: "Redirect to sign-in; no save action runs." },
    ], [cite("job-post-page", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][4])], undefined, "exclusive"),
    scene("company-check", "Load the company", "With a session, the page loads the user's company before deciding whether to render the form.", "spine", ["session-check"], [
      { kind: "traverse", edgeId: "page-company" }, { kind: "fork", mode: "exclusive", branchSceneIds: ["onboarding-redirect", "form-ready"] },
    ], [cite("job-post-page", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][5]), cite("company-action", "lib/actions/company.ts", sources["lib/actions/company.ts"][0])], undefined, "exclusive"),
    scene("onboarding-redirect", "Incomplete onboarding redirects", "A company without onboardedAt is sent to onboarding instead of the job form.", "failure", ["company-check"], [
      { kind: "enter", moduleId: "job-post-page" }, { kind: "outcome", result: "failure", text: "Redirect to onboarding; no save action runs." },
    ], [cite("job-post-page", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][6]), cite("job-post-page", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][7])], undefined, "exclusive"),
    scene("form-ready", "Render the form", "An onboarded company reaches JobPostForm with the signed-in user ID.", "spine", ["company-check"], [
      { kind: "enter", moduleId: "job-post-form" }, { kind: "effect", moduleId: "job-post-page", effect: "other", text: "Renders the form with the user's company identity." },
    ], [cite("job-post-page", "app/job-post/new/page.tsx", sources["app/job-post/new/page.tsx"][8])], undefined, "exclusive"),
    scene("validate-and-optimistically-update", "Validate and update the feed", "The form validates the fields, prepares the post, and places an optimistic row in the latest-jobs cache before the server confirms persistence.", "spine", ["form-ready"], [
      { kind: "effect", moduleId: "job-post-form", effect: "client-update", text: "Validates input and adds an optimistic feed row." },
    ], [cite("job-post-form", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][1]), cite("job-post-form", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][2])]),
    scene("submit-save", "Submit the save action", "After validation, the client starts saveJob with the prepared company and job-post payload.", "spine", ["validate-and-optimistically-update"], [
      { kind: "traverse", edgeId: "form-save" },
    ], [cite("job-post-form", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][3])]),
    scene("server-auth-check", "Verify the session again", "The server action checks the session independently; an expired or missing session is rejected before persistence.", "spine", ["submit-save"], [
      { kind: "traverse", edgeId: "save-auth" },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][8])]),
    scene("company-identity", "Choose the company identity", "The action reads an existing company by slug and uses its ID, falling back to the signed-in user ID.", "spine", ["server-auth-check"], [
      { kind: "traverse", edgeId: "save-database" }, { kind: "effect", moduleId: "database-client", effect: "other", text: "Reads the existing company identity." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][9]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][21])]),
    scene("database-commit", "Commit company and job together", "Neon's HTTP batch writes the company row and job post in one transaction; this is the persistence boundary.", "spine", ["company-identity"], [
      { kind: "traverse", edgeId: "save-database" }, { kind: "effect", moduleId: "database-client", effect: "write", text: "Commits the company and job-post rows together." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][9]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][11]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][12]), cite("database-client", "lib/db/index.ts", sources["lib/db/index.ts"][1])]),
    scene("post-commit-fanout", "Start post-commit consequences", "Once the batch resolves, Berry can explain cache refresh, realtime delivery, the returned result, and registered after-response indexing as separate consequences.", "spine", ["database-commit"], [
      { kind: "enter", moduleId: "save-job-action" }, { kind: "fork", mode: "independent", branchSceneIds: ["refresh-caches", "publish-realtime", "return-to-user", "schedule-indexing"] },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][12])]),
    scene("refresh-caches", "Refresh server caches and routes", "The action busts its memoized job views and revalidates the home and jobs routes after the database write.", "branch", ["post-commit-fanout"], [
      { kind: "traverse", edgeId: "save-memo" }, { kind: "traverse", edgeId: "save-route-cache" },
      { kind: "effect", moduleId: "memo-cache", effect: "cache", text: "Clears memoized job views." },
      { kind: "effect", moduleId: "route-cache", effect: "revalidation", text: "Revalidates affected routes." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][13]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][14])], "post-commit-effects", "independent"),
    scene("publish-realtime", "Publish a jobs notification", "The save action publishes a jobs event with the new post ID to the in-process realtime bus.", "branch", ["post-commit-fanout"], [
      { kind: "traverse", edgeId: "save-realtime" }, { kind: "effect", moduleId: "realtime-bus", effect: "notification", text: "Publishes the committed job ID to current listeners." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][15])], "post-commit-effects", "independent"),
    scene("sse-delivery", "Deliver to connected SSE routes", "The bus invokes its registered listeners; the route turns that event into an SSE message for connected tabs.", "branch", ["publish-realtime"], [
      { kind: "traverse", edgeId: "bus-sse" }, { kind: "effect", moduleId: "realtime-route", effect: "notification", text: "Sends the event over the open SSE stream." },
    ], [cite("realtime-bus", "lib/realtime/bus.ts", sources["lib/realtime/bus.ts"][0]), cite("realtime-route", "app/api/realtime/route.ts", sources["app/api/realtime/route.ts"][0])]),
    scene("client-refetch", "Invalidate browser feeds", "The browser keeps an EventSource open; on a jobs message it invalidates the jobs queries so the feeds refetch.", "branch", ["sse-delivery"], [
      { kind: "traverse", edgeId: "sse-client" }, { kind: "effect", moduleId: "realtime-client", effect: "client-update", text: "Invalidates jobs queries in connected tabs." },
    ], [cite("realtime-route", "app/api/realtime/route.ts", sources["app/api/realtime/route.ts"][1]), cite("realtime-client", "components/realtime-provider.tsx", sources["components/realtime-provider.tsx"][0]), cite("realtime-client", "components/realtime-provider.tsx", sources["components/realtime-provider.tsx"][1])]),
    scene("return-to-user", "Confirm and navigate", "The action returns the saved ID and slug. The form then invalidates feeds, refreshes the route, and navigates; this confirmed state follows the earlier optimistic row.", "branch", ["post-commit-fanout"], [
      { kind: "return", edgeId: "save-return" }, { kind: "effect", moduleId: "job-post-form", effect: "client-update", text: "Refreshes, invalidates feeds, and navigates after the confirmed response." },
      { kind: "outcome", result: "success", text: "The committed post is available by its returned ID and slug." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][20]), cite("job-post-form", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][4]), cite("job-post-form", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][5]), cite("job-post-form", "components/job-post-form.tsx", sources["components/job-post-form.tsx"][6])], "post-commit-effects", "independent"),
    scene("schedule-indexing", "Register after-response indexing", "The action registers the embedding task with after(); the task starts after the response rather than blocking the saved-job result.", "branch", ["post-commit-fanout"], [
      { kind: "spawn", moduleId: "save-job-action", edgeId: "save-embedding", sceneId: "embed-task", afterResponse: true, afterSceneId: "return-to-user" },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][16]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][17])], "post-commit-effects", "independent"),
    scene("embed-task", "Build and embed job text", "After the response, the deferred callback assembles the job fields and asks the embedding client for a vector.", "deferred", ["schedule-indexing", "return-to-user"], [
      { kind: "effect", moduleId: "embedding-client", effect: "other", text: "Builds the job text and requests its embedding." },
    ], [cite("embedding-client", "lib/embeddings.ts", sources["lib/embeddings.ts"][0]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][17])]),
    scene("pinecone-upsert", "Upsert the vector", "The deferred callback sends the generated vector and job metadata to Pinecone after embedding completes.", "deferred", ["embed-task"], [
      { kind: "traverse", edgeId: "save-pinecone" }, { kind: "effect", moduleId: "pinecone-search", effect: "other", text: "Upserts the vector under the saved job ID." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][18]), cite("pinecone-search", "lib/pinecone.ts", sources["lib/pinecone.ts"][1])]),
    scene("index-result", "Indexing can succeed or fail", "The indexing callback handles completion and failure separately from the committed database result.", "deferred", ["pinecone-upsert"], [
      { kind: "enter", moduleId: "pinecone-search" }, { kind: "fork", mode: "exclusive", branchSceneIds: ["index-succeeded", "index-failed"] },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][19])]),
    scene("index-succeeded", "Search index is updated", "If embedding and upsert return successfully, the new vector is available to semantic search.", "deferred", ["index-result"], [
      { kind: "enter", moduleId: "pinecone-search" }, { kind: "outcome", result: "success", text: "Deferred indexing completed." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][18])], undefined, "exclusive"),
    scene("index-failed", "Index failure does not undo the save", "The callback catches and logs embedding or Pinecone errors; the already committed job and successful response remain intact.", "deferred", ["index-result"], [
      { kind: "enter", moduleId: "save-job-action" }, { kind: "effect", moduleId: "save-job-action", effect: "other", text: "Logs the deferred indexing error without rolling back the committed post." },
      { kind: "outcome", result: "failure", text: "Search indexing failed independently; the saved job remains committed." },
    ], [cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][19]), cite("save-job-action", "lib/actions/save-job.ts", sources["lib/actions/save-job.ts"][20])], undefined, "exclusive"),
  ],
  contextOnly: [],
  completion: {
    status: "success",
    summary: "The job is committed and returned, server and browser views refresh, realtime subscribers refetch, and search indexing continues after the response with an independent logged failure boundary.",
    deferredSceneIds: ["embed-task", "pinecone-upsert", "index-result", "index-succeeded", "index-failed"],
  },
};

const core = {
  meta: { repo: repo.repo, sha: SHA, title: "Publishing a job post", generatedAt: "2026-11-12T00:00:00.000Z", generatorVersion: "3", storyVersion: 3 },
  summary: ["A company user publishes a job post."],
  stack: ["Next.js", "Drizzle", "Neon", "TanStack Query", "SSE", "Pinecone"],
  modules,
  edges,
  story,
  interview: { pitch: "The server commits the post and explains each triggered consequence.", tradeoffs: [], questions: [] },
};

test("the pinned job-post story covers its complete causal branches without linearizing them", () => {
  const result = verify(AnalysisCore.parse(core), repo, facts);
  assert.deepEqual(result.failures, []);
  assert.equal(result.analysis.story.completion.status, "success");
  assert.ok(result.analysis.story.scenes.length > 8);
  assert.equal(result.analysis.story.contextOnly.length, 0);
  assert.equal(result.analysis.edges.find((item) => item.id === "page-form-import")?.kind, "import");

  const branches = ["refresh-caches", "publish-realtime", "return-to-user", "schedule-indexing"]
    .map((id) => result.analysis.story.scenes.find((item) => item.id === id));
  assert.ok(branches.every((branch) => branch?.dependsOn.includes("post-commit-fanout")));
  assert.ok(branches.every((branch) => branch?.parallelGroup === "post-commit-effects"));
  assert.ok(branches.every((branch) => !branch?.dependsOn.some((id) => branches.some((other) => other?.id === id))));

  const embed = result.analysis.story.scenes.find((item) => item.id === "embed-task");
  assert.ok(embed?.dependsOn.includes("schedule-indexing"));
  assert.ok(embed?.dependsOn.includes("return-to-user"));
  assert.equal(result.analysis.edges.find((item) => item.id === "bus-sse")?.inferred, true);
});

test("invalid references, non-runtime hops, missing coverage, and dependency cycles stay partial", () => {
  const missingEdge = structuredClone(core);
  missingEdge.story.scenes.find((item) => item.id === "submit-save").actions[0].edgeId = "not-a-real-edge";
  assert.equal(verify(AnalysisCore.parse(missingEdge), repo, facts).analysis.story.completion.status, "partial");

  const importTraversal = structuredClone(core);
  importTraversal.story.scenes.find((item) => item.id === "submit-save").actions[0].edgeId = "page-form-import";
  assert.equal(verify(AnalysisCore.parse(importTraversal), repo, facts).analysis.story.completion.status, "partial");

  const invalidSpawn = structuredClone(core);
  invalidSpawn.story.scenes.find((item) => item.id === "schedule-indexing").actions[0].edgeId = "save-auth";
  const spawnResult = verify(AnalysisCore.parse(invalidSpawn), repo, facts);
  assert.equal(spawnResult.analysis.story.completion.status, "partial");
  assert.ok(spawnResult.analysis.story.scenes.find((item) => item.id === "embed-task")?.unverified);
  assert.ok(!spawnResult.analysis.story.scenes.find((item) => item.id === "schedule-indexing")?.actions.some((action) => action.kind === "spawn"));

  const missingCoverage = structuredClone(core);
  missingCoverage.modules.push(makeModule("unexplained-helper", "Unexplained helper", "utility", "service", "lib/unused", ["lib/unused.ts"]));
  const extendedRepo = { ...repo, files: new Map([...files, ["lib/unused.ts", "export function helper() {}"]]) };
  const extendedFacts = scan(extendedRepo.repo, extendedRepo.sha, extendedRepo.files);
  assert.equal(verify(AnalysisCore.parse(missingCoverage), extendedRepo, extendedFacts).analysis.story.completion.status, "partial");

  const cycle = structuredClone(core);
  cycle.story.scenes.find((item) => item.id === "post-commit-fanout").dependsOn.push("refresh-caches");
  const result = verify(AnalysisCore.parse(cycle), repo, facts);
  assert.equal(result.analysis.story.completion.status, "partial");
  assert.ok(result.failures.some((failure) => failure.includes("cycle")));
});

test("legacy saved analyses migrate without claiming a complete storyboard", () => {
  const migrated = fromLegacyAnalysis({
    meta: { repo: "owner/repo", sha: "1234567", title: "Old result", generatedAt: "2025-01-01T00:00:00.000Z" },
    summary: [], stack: [],
    modules: [makeModule("entry", "Entry", "entry", "service", "src", ["src/index.ts"])],
    edges: [],
    flow: [{ id: "old-step", moduleId: "entry", edgeId: "", title: "Entry", text: "An old single-path step." }],
    interview: { pitch: "", tradeoffs: [], questions: [] },
    codingPrompt: "",
  });
  assert.equal(migrated.meta.generatorVersion, "legacy");
  assert.equal(migrated.story.completion.status, "partial");
});
