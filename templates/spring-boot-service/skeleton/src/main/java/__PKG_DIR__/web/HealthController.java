package __JAVA_PKG__.web;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A liveness endpoint of the application's own, distinct from Actuator's.
 *
 * <p>Actuator answers on the management port, which is not necessarily reachable from where a
 * caller is; this answers on the application port a client already uses.
 */
@RestController
@RequestMapping("/api/v1")
public class HealthController {

  /**
   * Answers that the application is serving.
   *
   * @return a body naming the service and the moment it answered
   */
  @GetMapping("/hello")
  public Map<String, Object> hello() {
    return Map.of(
        "service", "__ARTIFACT_ID__",
        "message", "hello from __PROJECT_NAME__",
        "timestamp", Instant.now().toString());
  }
}
