import { getShare } from "@/server/share";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const analysis = await getShare(id);
  if (!analysis) {
    return Response.json({ message: "That link does not exist." }, { status: 404 });
  }
  return Response.json(analysis);
}
