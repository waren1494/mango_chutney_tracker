import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { date, legs } = body;

    if (!date || !Array.isArray(legs)) {
      return new Response(JSON.stringify({ error: "date and legs[] are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const store = getStore("mango-days");
    await store.setJSON(date, { date, legs, updatedAt: new Date().toISOString() });

    return new Response(JSON.stringify({ ok: true, date, count: legs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
