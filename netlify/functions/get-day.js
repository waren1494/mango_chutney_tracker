import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return new Response(JSON.stringify({ error: "date query param is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const store = getStore("mango-days");
    const data = await store.get(date, { type: "json" });

    return new Response(JSON.stringify(data || { date, legs: [] }), {
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
