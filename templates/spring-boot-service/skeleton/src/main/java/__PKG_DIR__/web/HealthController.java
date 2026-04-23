package __JAVA_PKG__.web;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class HealthController {

    @GetMapping("/hello")
    public Map<String, Object> hello() {
        return Map.of(
            "service", "__ARTIFACT_ID__",
            "message", "hello from __PROJECT_NAME__",
            "timestamp", Instant.now().toString());
    }
}
