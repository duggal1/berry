import type { Analysis } from "./schema";
const ev=(path:string,snippet:string)=>({path,snippet});
export const EXAMPLE:Analysis={meta:{repo:"example/orders-api",sha:"demo",title:"Orders API, as it runs",generatedAt:"2026-01-01T00:00:00Z"},summary:["Orders API takes order requests over HTTP, checks who is calling, and turns valid requests into saved orders.","The order logic is the center of the system: it writes to the orders database, charges the card through a payments client, and queues the shipping work.","A separate worker reads that queue, marks the order as shipped and sends a receipt by email.","Two outside services sit at the edges: a payment provider and an email provider.","One request travels from the HTTP layer through auth and order logic, then splits into a saved row, a charge and a queued job."],stack:["TypeScript","HTTP API","Job queue","SQL database"],modules:[
{id:"api",name:"HTTP API",role:"entry",kind:"service",purpose:"Receives order requests and validates them.",path:"src/api",files:["src/api/server.ts","src/api/routes.ts","src/api/validate.ts"],group:""},
{id:"auth",name:"Auth",role:"core",kind:"service",purpose:"Checks the caller's token before anything else runs.",path:"src/auth",files:["src/auth/verify.ts","src/auth/session.ts"],group:""},
{id:"orders",name:"Order logic",role:"core",kind:"service",purpose:"Creates orders, charges them and queues fulfilment.",path:"src/orders",files:["src/orders/create.ts","src/orders/pricing.ts","src/orders/state.ts"],group:""},
{id:"payments",name:"Payments client",role:"integration",kind:"service",purpose:"Wraps the payment provider's charge call.",path:"src/payments",files:["src/payments/charge.ts","src/payments/refund.ts"],group:""},
{id:"db",name:"Orders DB",role:"data",kind:"datastore",purpose:"Stores orders and their state.",path:"src/db",files:["src/db/schema.ts","src/db/client.ts","src/db/migrations/001.sql"],group:""},
{id:"queue",name:"Fulfilment queue",role:"data",kind:"queue",purpose:"Holds shipping jobs until the worker takes them.",path:"src/jobs",files:["src/jobs/queue.ts","src/jobs/types.ts"],group:""},
{id:"worker",name:"Worker",role:"utility",kind:"service",purpose:"Ships queued orders and sends receipts.",path:"src/worker",files:["src/worker/main.ts","src/worker/ship.ts","src/worker/receipt.ts"],group:""},
{id:"provider",name:"Payment provider",role:"integration",kind:"external",purpose:"Third-party service that moves the money.",path:"external",files:[],group:""},
{id:"mail",name:"Email provider",role:"integration",kind:"external",purpose:"Third-party service that delivers receipts.",path:"external",files:[],group:""}],edges:[
{id:"e1",from:"api",to:"auth",kind:"call",label:"verify token",inferred:false,evidence:ev("src/api/routes.ts","const user = await verifyToken(req.headers.authorization);")},
{id:"e2",from:"api",to:"orders",kind:"call",label:"create order",inferred:false,evidence:ev("src/api/routes.ts","const order = await createOrder(user, body);")},
{id:"e3",from:"orders",to:"db",kind:"data",label:"insert",inferred:false,evidence:ev("src/orders/create.ts","await db.insert(orders).values(draft);")},
{id:"e4",from:"orders",to:"payments",kind:"call",label:"charge",inferred:false,evidence:ev("src/orders/create.ts","const paid = await charge(order.total, user.card);")},
{id:"e5",from:"payments",to:"provider",kind:"call",label:"POST charges",inferred:false,evidence:ev("src/payments/charge.ts","await provider.charges.create({ amount, source });")},
{id:"e6",from:"orders",to:"queue",kind:"event",label:"enqueue",inferred:false,evidence:ev("src/orders/create.ts","await queue.push({ type: 'ship', orderId: order.id });")},
{id:"e7",from:"queue",to:"worker",kind:"event",label:"deliver job",inferred:true,evidence:ev("src/worker/main.ts","queue.consume('ship', handleShip);")},
{id:"e8",from:"worker",to:"db",kind:"data",label:"mark shipped",inferred:false,evidence:ev("src/worker/ship.ts","await db.update(orders).set({ state: 'shipped' });")},
{id:"e9",from:"worker",to:"mail",kind:"call",label:"send receipt",inferred:false,evidence:ev("src/worker/receipt.ts","await mailer.send({ to: user.email, template: 'receipt' });")}],flow:[
{id:"s1",moduleId:"api",edgeId:"",title:"Request arrives",text:"The HTTP layer receives a create-order request and validates the body."},
{id:"s2",moduleId:"auth",edgeId:"e1",title:"Caller is checked",text:"The token is verified before any order code runs."},
{id:"s3",moduleId:"orders",edgeId:"e2",title:"Order is built",text:"Order logic prices the cart and drafts the order."},
{id:"s4",moduleId:"db",edgeId:"e3",title:"Order is saved",text:"The draft is inserted into the orders database."},
{id:"s5",moduleId:"payments",edgeId:"e4",title:"Card is charged",text:"The payments client asks the provider to take the money."},
{id:"s6",moduleId:"queue",edgeId:"e6",title:"Shipping is queued",text:"A ship job is pushed so the response does not wait for fulfilment."},
{id:"s7",moduleId:"worker",edgeId:"e7",title:"Worker takes the job",text:"The worker picks the job up, marks the order shipped and emails a receipt."}],interview:{pitch:"Orders API is a small order pipeline. A request is authenticated, turned into a saved order, charged through an outside provider, and handed to a background worker through a queue so the customer gets a fast response. I kept the money path synchronous and everything slow asynchronous.",tradeoffs:["The charge happens before the response, so a slow provider slows the request.","The queue decouples shipping from the request, at the cost of eventual consistency on order state.","Order logic owns both the database write and the charge, so a failure between them needs a clear recovery rule."],questions:[{q:"Why queue the shipping work?",a:"Shipping and receipts are slow and can fail independently. Queuing them keeps the request fast and lets the worker retry without touching the customer's request."},{q:"What happens if the charge succeeds but the queue push fails?",a:"The order is paid but not shipped. The order state stays at paid, and a sweep job or manual retry should re-queue it. That recovery path is the weak spot to name."},{q:"Where would you add idempotency?",a:"On create order, keyed by a client-supplied request id, so a retried request cannot charge twice."}]},codingPrompt:`You are joining the example/orders-api codebase. Read this before you change anything.

Architecture
- src/api is the only entry point. It validates the request and routes it. It holds no business rules.
- src/auth verifies the caller's token. Every route calls it first.
- src/orders is the core. It prices the cart, inserts the order into src/db, charges through src/payments, then pushes a ship job to src/jobs.
- src/worker consumes the ship job, marks the order shipped in src/db and sends a receipt through the email provider.
- src/payments and the email client wrap outside services. Keep provider calls inside them.

Request path
1. HTTP API receives the create-order request.
2. Auth verifies the token.
3. Order logic builds and saves the order, charges the card and queues shipping.
4. The worker finishes the order asynchronously.

Rules
- Put new business logic in src/orders, not in src/api.
- Never call the payment or email provider outside their client modules.
- A change to order state must also update the worker's assumptions in src/worker/ship.ts.

Known weak spots
- A failure between the charge and the queue push leaves a paid order that is not shipped.
- Create order has no idempotency key yet.`};
