import {
  defineEventHandler,
  getRequestHeaders,
  // getRequestURL,
  readRawBody,
  setResponseStatus,
} from "h3";

const API_URL = process.env.VITE_BACKEND_URL!;

export default defineEventHandler(async (event) => {
  const path = event.context.params?.path || "";
  const url = `${API_URL}/${path}`;

  const body =
    ["POST", "PUT", "PATCH"].includes(event.method)
      ? await readRawBody(event)
      : undefined;

  const response = await fetch(url, {
    method: event.method,
    headers: {
      ...getRequestHeaders(event),
    },
    body,
  });

  // Forward Set-Cookie from backend
  const cookies = response.headers.get("set-cookie");

  if (cookies) {
    const rewritten = cookies.replace(
      /Domain=[^;]+/gi,
      "Domain=frontend.com"
    );

    event?.node?.res?.setHeader("set-cookie", rewritten);
  }

  setResponseStatus(event, response.status);

  return response.body;
});