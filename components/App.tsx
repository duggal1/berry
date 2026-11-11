"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchShared } from "@/lib/api";
import { EXAMPLE } from "@/lib/fixture";
import { useAnalysisRun, useRoute } from "@/lib/hooks";
import type { Analysis } from "@/lib/schema";
import { getAnalysis, saveAnalysis } from "@/lib/store";
import { INK } from "@/sketch/palette";
import { CanvasStage } from "./Stage";
import { Header } from "./Header";
import { History } from "./History";
import { Home } from "./Home";
import { Thinking } from "./Thinking";
import { Workspace } from "./Workspace";
import { wipe } from "./ui";

function Message({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <main className="mx-auto w-full max-w-[1680px] px-5 pt-32 md:px-10 md:pt-36">
      <h1 className="t-h1 max-w-[14ch]">{title}</h1>
      <p className="t-lead mt-5 max-w-[36rem]">{body}</p>
      <a
        href="#/"
        style={wipe(INK)}
        className="btn mt-8 inline-flex h-11 items-center bg-neutral-950 px-5 text-[16px] font-medium tracking-tight text-white transition-colors duration-100 hover:text-white"
      >
        Explain a repo
      </a>
    </main>
  );
}

function RunInner({
  url,
  token,
  onRetry,
}: {
  url: string;
  token: string | null;
  onRetry: () => void;
}) {
  const run = useAnalysisRun(url, token);
  const has = run.analysis !== null && run.status !== "error";
  return (
    <>
      <Thinking
        stages={run.stages}
        trace={run.trace}
        status={run.status}
        error={run.error}
        compact={has}
        count={run.analysis?.modules.length ?? 0}
        onRetry={onRetry}
      />
      {run.analysis && run.status !== "error" && (
        <Workspace analysis={run.analysis} running={run.status === "running"} below />
      )}
    </>
  );
}

function RunView({ url, token }: { url: string; token: string | null }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <RunInner
      key={`${url}:${attempt}`}
      url={url}
      token={token}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}

function LocalView({ id }: { id: string }) {
  const [a, setA] = useState<Analysis | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getAnalysis(id)
      .then((r) => live && setA(r))
      .catch(() => live && setA(null));
    return () => {
      live = false;
    };
  }, [id]);
  if (a === undefined) return <main className="min-h-screen" aria-busy />;
  if (!a) return <Message title="Not found." body="This analysis is not saved in this browser." />;
  return <Workspace analysis={a} />;
}

function CanvasView({ id }: { id: string }) {
  const [a, setA] = useState<Analysis | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getAnalysis(id)
      .then((r) => live && setA(r))
      .catch(() => live && setA(null));
    return () => {
      live = false;
    };
  }, [id]);
  if (a === undefined) return <main className="min-h-screen" aria-busy />;
  if (!a) return <Message title="Not found." body="This analysis is not saved in this browser." />;
  return <CanvasStage data={{ modules: a.modules, edges: a.edges, flow: a.flow }} title={a.meta.title} id={id} onBack={() => { location.hash = `#/r/${id}`; }} />;
}

function SharedView({ id }: { id: string }) {
  const [a, setA] = useState<Analysis | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    fetchShared(id)
      .then((r) => live && setA(r))
      .catch((e) => {
        if (!live) return;
        setErr(e instanceof Error ? e.message : "Could not load this link.");
        setA(null);
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (a === undefined) return <main className="min-h-screen" aria-busy />;
  if (!a) return <Message title="That link did not load." body={err || "It may have been removed."} />;
  return (
    <Workspace
      analysis={a}
      onSaveCopy={async () => {
        const rec = await saveAnalysis(a);
        location.hash = `#/r/${encodeURIComponent(rec.id)}`;
      }}
    />
  );
}

export default function App() {
  const route = useRoute();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  const start = (url: string, t: string | null) => {
    setToken(t);
    location.hash = `#/run/${encodeURIComponent(url)}`;
  };

  return (
    <>
      <Header route={route} />
      {route.name === "home" && <Home onStart={start} />}
      {route.name === "example" && <Workspace analysis={EXAMPLE} demo />}
      {route.name === "run" && <RunView url={route.url} token={token} />}
      {route.name === "history" && <History />}
      {route.name === "local" && <LocalView key={route.id} id={route.id} />}
      {route.name === "canvas" && <CanvasView key={route.id} id={route.id} />}
      {route.name === "shared" && <SharedView key={route.id} id={route.id} />}
    </>
  );
}
