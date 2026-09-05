package __JAVA_PKG__;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Entry point: component scanning and auto-configuration are rooted at this class's package. */
@SpringBootApplication
public class Application {

  /**
   * Starts the application.
   *
   * @param args passed through to Spring Boot, which reads them as property overrides
   */
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
