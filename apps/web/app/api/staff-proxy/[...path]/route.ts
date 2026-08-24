import { NextRequest, NextResponse } from "next/server";

import { handleStaffProxyRequest } from "../../../../lib/staff-proxy-api";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleStaffProxyRequest(request, `/${path.join("/")}`);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleStaffProxyRequest(request, `/${path.join("/")}`);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleStaffProxyRequest(request, `/${path.join("/")}`);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleStaffProxyRequest(request, `/${path.join("/")}`);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleStaffProxyRequest(request, `/${path.join("/")}`);
}
