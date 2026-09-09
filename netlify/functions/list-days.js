import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("mango-days");
    const { blobs } = await store.list();
    const dates = blobs.map((b) => b.key).sort().reverse();

    return new Response(JSON.stringify({ dates }), {
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
