import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';

@Catch(HttpException)
export class RpcHttpExceptionFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost): Observable<never> | void {
    const response = exception.getResponse();
    const body = typeof response === 'string' ? { message: response } : response;
    const error = { ...body, statusCode: exception.getStatus() };
    if (host.getType() === 'rpc') return throwError(() => error);
    host.switchToHttp().getResponse().status(exception.getStatus()).json(error);
  }
}
