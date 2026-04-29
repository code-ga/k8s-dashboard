import {
  defineEventHandler
} from "h3";

const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:3001";

export default defineEventHandler(async (event) => {
  console.log("Proxying request to:", BACKEND_URL, "With context:", event);
  const path = event.url.pathname ?? "";

  const url = `${BACKEND_URL}${path}`;
  // const body =
  //   event.method !== "GET" && event.method !== "HEAD"
  //     ? await readRawBody(event)
  //     : undefined;

  const header = new Headers(event.req.headers);
  header.set("host", new URL(BACKEND_URL).host);

  const response = await fetch(url, {
    method: event.method,
    headers: header,
    body:event.req.body,
    ///@ts-ignore
    duplex: "half",
  });
  console.log("Received response from backend:", response.status, response.statusText);

  return response;
});