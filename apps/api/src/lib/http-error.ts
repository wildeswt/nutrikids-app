export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }

  static badRequest(message: string): HttpError {
    return new HttpError(400, message);
  }

  static unauthorized(message = 'No autorizado'): HttpError {
    return new HttpError(401, message);
  }

  static forbidden(message = 'Acceso denegado'): HttpError {
    return new HttpError(403, message);
  }

  static notFound(message = 'Recurso no encontrado'): HttpError {
    return new HttpError(404, message);
  }

  static conflict(message: string): HttpError {
    return new HttpError(409, message);
  }

  static tooManyRequests(message: string): HttpError {
    return new HttpError(429, message);
  }
}
