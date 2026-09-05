package __JAVA_PKG__.web;

import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns validation failures into RFC 7807 problem responses.
 *
 * <p>Without it a constraint violation surfaces as a stack trace shaped by whatever threw it, and
 * the response body differs depending on which layer rejected the request.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ProblemDetail handleBeanValidation(MethodArgumentNotValidException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    pd.setType(URI.create("https://__PROJECT_NAME__/errors/validation"));
    pd.setTitle("Validation failed");
    return pd;
  }

  @ExceptionHandler(ConstraintViolationException.class)
  ProblemDetail handleConstraint(ConstraintViolationException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    pd.setType(URI.create("https://__PROJECT_NAME__/errors/constraint"));
    pd.setTitle("Constraint violation");
    return pd;
  }

  @ExceptionHandler(IllegalArgumentException.class)
  ProblemDetail handleIllegalArg(IllegalArgumentException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    pd.setTitle("Bad request");
    return pd;
  }
}
