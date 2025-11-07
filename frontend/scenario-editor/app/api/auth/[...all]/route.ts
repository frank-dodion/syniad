import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const handler = toNextJsHandler(auth.handler);

export async function GET(request: NextRequest) {
  console.log('[Better Auth] GET request:', request.nextUrl.pathname);
  console.log('[Better Auth] Full URL:', request.nextUrl.toString());
  console.log('[Better Auth] Query params:', Object.fromEntries(request.nextUrl.searchParams));
  const response = await handler.GET(request);
  console.log('[Better Auth] GET response status:', response.status);
  if (response.headers.get('location')) {
    console.log('[Better Auth] Redirect location:', response.headers.get('location'));
  }
  return response;
}

export async function POST(request: NextRequest) {
  console.log('[Better Auth] POST request:', request.nextUrl.pathname);
  console.log('[Better Auth] Full URL:', request.nextUrl.toString());
  const response = await handler.POST(request);
  console.log('[Better Auth] POST response status:', response.status);
  if (response.headers.get('location')) {
    console.log('[Better Auth] Redirect location:', response.headers.get('location'));
  }
  // Clone response to read body without consuming it
  const clonedResponse = response.clone();
  if (response.status === 200 || response.status === 302) {
    clonedResponse.text().then(body => {
      console.log('[Better Auth] Response body (first 500 chars):', body.substring(0, 500));
      // Check for redirect URLs in the body
      const urlMatch = body.match(/https?:\/\/[^\s"']+/g);
      if (urlMatch) {
        console.log('[Better Auth] URLs found in response:', urlMatch);
      }
    }).catch(() => {});
  }
  return response;
}

