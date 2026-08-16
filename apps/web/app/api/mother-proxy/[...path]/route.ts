import { NextRequest, NextResponse } from "next/server";

import { handleMotherProxyRequest } from "../../../../lib/mother-proxy-api";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleMotherProxyRequest(request, `/${path.join("/")}`);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleMotherProxyRequest(request, `/${path.join("/")}`);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleMotherProxyRequest(request, `/${path.join("/")}`);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  return handleMotherProxyRequest(request, `/${path.join("/")}`);
}
