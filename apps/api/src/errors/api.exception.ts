import { HttpException } from "@nestjs/common";

export interface ApiExceptionOptions {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly details?: unknown;
  readonly fields?: Readonly<Record<string, string>>;
}

export class ApiException extends HttpException {
  public readonly code: string;
  public readonly details: unknown;
  public readonly fields: Readonly<Record<string, string>> | undefined;

  public constructor(options: ApiExceptionOptions) {
    super(options.message, options.status);
    this.code = options.code;
    this.details = options.details ?? null;
    this.fields = options.fields;
  }
}
